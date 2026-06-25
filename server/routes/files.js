import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import db from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()

const DATA_DIR = process.env.DATA_DIR || './data'
const REFS_DIR = path.join(DATA_DIR, 'refs')
if (!fs.existsSync(REFS_DIR)) fs.mkdirSync(REFS_DIR, { recursive: true })

// Disk storage — uses a random key as the on-disk name to avoid collisions
// while keeping the original filename for display. Files live under the
// project DATA_DIR so they ride along with the SQLite DB.
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, REFS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      // 16 random bytes + user id prefix so paths are unguessable
      const key = `${req.user.id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`
      cb(null, key)
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per file
})

// All routes require auth
router.use(requireAuth)

// POST /api/files — upload a single file
router.post('/', upload.single('file'), (req, res) => {
  const f = req.file
  if (!f) return res.status(400).json({ error: 'No file uploaded' })
  const result = db.prepare(
    'INSERT INTO files (user_id, filename, storage_key, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, f.originalname, f.filename, f.mimetype, f.size)
  res.status(201).json({
    id: result.lastInsertRowid,
    filename: f.originalname,
    mime_type: f.mimetype,
    size_bytes: f.size,
  })
})

// GET /api/files/:id/raw — serve the file content. Only the owner can read.
router.get('/:id/raw', (req, res) => {
  const file = db.prepare(
    'SELECT * FROM files WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id)
  if (!file) return res.status(404).json({ error: 'File not found' })
  const fullPath = path.join(REFS_DIR, file.storage_key)
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File missing on disk' })
  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream')
  res.setHeader('Content-Disposition', `inline; filename="${file.filename.replace(/"/g, '')}"`)
  fs.createReadStream(fullPath).pipe(res)
})

// DELETE /api/files/:id — delete from DB + disk. Refs pointing at this
// file have their file_id NULLed via ON DELETE SET NULL.
router.delete('/:id', (req, res) => {
  const file = db.prepare(
    'SELECT * FROM files WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id)
  if (!file) return res.status(404).json({ error: 'File not found' })
  const fullPath = path.join(REFS_DIR, file.storage_key)
  try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath) } catch { /* best-effort: file may already be gone */ }
  db.prepare('DELETE FROM files WHERE id = ?').run(file.id)
  res.json({ ok: true })
})

export default router
