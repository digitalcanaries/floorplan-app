import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import db from '../db.js'
import { requireAuth } from '../auth.js'
import { isR2Enabled, putObject, deleteObject, presignGet } from '../r2.js'

const router = Router()

const DATA_DIR = process.env.DATA_DIR || './data'
const REFS_DIR = path.join(DATA_DIR, 'refs')
if (!fs.existsSync(REFS_DIR)) fs.mkdirSync(REFS_DIR, { recursive: true })

// Multer stores in memory so we can stream either to R2 or to disk.
// 50 MB per file; R2 handles much larger, but keeping the cap in place
// as a sanity check until multipart upload is wired.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
})

// All routes require auth
router.use(requireAuth)

// Build a random, unguessable object key. R2 keys use forward slashes so
// browsing the bucket in the Cloudflare UI groups by user id.
function makeKey(userId, originalName) {
  const ext = path.extname(originalName).toLowerCase()
  return `u${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`
}

// POST /api/files — upload. Uses R2 when configured, disk otherwise.
router.post('/', upload.single('file'), async (req, res) => {
  const f = req.file
  if (!f) return res.status(400).json({ error: 'No file uploaded' })

  const key = makeKey(req.user.id, f.originalname)

  try {
    if (isR2Enabled()) {
      await putObject(key, f.buffer, f.mimetype)
    } else {
      // Legacy fallback — write to local disk with the key as the filename
      const localPath = path.join(REFS_DIR, key.replace(/\//g, '__'))
      fs.writeFileSync(localPath, f.buffer)
    }
  } catch (err) {
    console.error('[files] upload failed:', err?.message || err)
    return res.status(500).json({ error: 'Upload failed: ' + (err?.message || 'unknown') })
  }

  const result = db.prepare(
    'INSERT INTO files (user_id, filename, storage_key, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, f.originalname, key, f.mimetype, f.size)

  res.status(201).json({
    id: result.lastInsertRowid,
    filename: f.originalname,
    mime_type: f.mimetype,
    size_bytes: f.size,
  })
})

// GET /api/files/:id/raw — deliver the file content.
//
// With R2: 302 redirects to a short-lived presigned URL, so the browser /
// iPad fetches directly from Cloudflare's edge (fast, doesn't proxy through
// Express).
//
// Without R2 (local disk fallback): streams the file bytes directly.
router.get('/:id/raw', async (req, res) => {
  const file = db.prepare(
    'SELECT * FROM files WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id)
  if (!file) return res.status(404).json({ error: 'File not found' })

  // R2-stored keys always contain a slash prefix (u<userId>/...); legacy
  // local files have their slashes flattened to '__' so we know which is
  // which without an extra column.
  const looksLikeR2Key = file.storage_key.includes('/')

  if (isR2Enabled() && looksLikeR2Key) {
    try {
      const url = await presignGet(file.storage_key, {
        filename: file.filename,
        contentType: file.mime_type,
      })
      return res.redirect(302, url)
    } catch (err) {
      console.error('[files] presign failed:', err?.message || err)
      return res.status(500).json({ error: 'Presign failed' })
    }
  }

  // Local disk path
  const localName = looksLikeR2Key
    ? file.storage_key.replace(/\//g, '__')
    : file.storage_key
  const fullPath = path.join(REFS_DIR, localName)
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File missing on disk' })
  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream')
  res.setHeader('Content-Disposition', `inline; filename="${file.filename.replace(/"/g, '')}"`)
  fs.createReadStream(fullPath).pipe(res)
})

// DELETE /api/files/:id — delete from DB + storage.
router.delete('/:id', async (req, res) => {
  const file = db.prepare(
    'SELECT * FROM files WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id)
  if (!file) return res.status(404).json({ error: 'File not found' })

  const looksLikeR2Key = file.storage_key.includes('/')
  try {
    if (isR2Enabled() && looksLikeR2Key) {
      await deleteObject(file.storage_key)
    } else {
      const localName = looksLikeR2Key
        ? file.storage_key.replace(/\//g, '__')
        : file.storage_key
      const fullPath = path.join(REFS_DIR, localName)
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    }
  } catch (err) {
    console.warn('[files] delete storage failed (proceeding with DB delete):', err?.message || err)
  }

  db.prepare('DELETE FROM files WHERE id = ?').run(file.id)
  res.json({ ok: true })
})

export default router
