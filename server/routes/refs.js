import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()
router.use(requireAuth)

// Helper — confirm the user owns the project, and return its id
function getOwnedProject(userId, projectId) {
  return db.prepare(
    'SELECT id FROM projects WHERE id = ? AND user_id = ?'
  ).get(projectId, userId)
}

// All ref columns we accept on create/update. set_id is omitted from update
// because the join key shouldn't change after creation.
const REF_FIELDS = [
  'set_id', 'kind', 'label', 'category', 'file_id',
  'paint_brand', 'paint_code', 'paint_color', 'paint_finish',
  'furniture_url', 'furniture_status', 'furniture_dimensions', 'furniture_source',
  'notes', 'sort_order',
]

// GET /api/projects/:pid/refs?set_id=X
// Lists refs for a project. If set_id query param is provided, scopes to
// that set (use 'null' literal or 'project' to list project-level only).
router.get('/projects/:pid/refs', (req, res) => {
  const project = getOwnedProject(req.user.id, req.params.pid)
  if (!project) return res.status(404).json({ error: 'Project not found' })

  let rows
  if (req.query.set_id === 'null' || req.query.set_id === 'project') {
    rows = db.prepare('SELECT * FROM refs WHERE project_id = ? AND set_id IS NULL ORDER BY kind, sort_order, id').all(project.id)
  } else if (req.query.set_id) {
    rows = db.prepare('SELECT * FROM refs WHERE project_id = ? AND set_id = ? ORDER BY kind, sort_order, id').all(project.id, parseInt(req.query.set_id))
  } else {
    rows = db.prepare('SELECT * FROM refs WHERE project_id = ? ORDER BY set_id, kind, sort_order, id').all(project.id)
  }
  res.json(rows)
})

// POST /api/projects/:pid/refs — create a reference
router.post('/projects/:pid/refs', (req, res) => {
  const project = getOwnedProject(req.user.id, req.params.pid)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  if (!req.body.kind) return res.status(400).json({ error: 'kind required' })

  const cols = []
  const placeholders = []
  const values = []
  cols.push('project_id'); placeholders.push('?'); values.push(project.id)
  for (const f of REF_FIELDS) {
    if (req.body[f] !== undefined) {
      cols.push(f); placeholders.push('?'); values.push(req.body[f])
    }
  }
  const result = db.prepare(
    `INSERT INTO refs (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`
  ).run(...values)
  const row = db.prepare('SELECT * FROM refs WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json(row)
})

// PUT /api/projects/:pid/refs/:rid — update a reference
router.put('/projects/:pid/refs/:rid', (req, res) => {
  const project = getOwnedProject(req.user.id, req.params.pid)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  const existing = db.prepare(
    'SELECT id FROM refs WHERE id = ? AND project_id = ?'
  ).get(req.params.rid, project.id)
  if (!existing) return res.status(404).json({ error: 'Reference not found' })

  const sets = []
  const values = []
  for (const f of REF_FIELDS) {
    if (f === 'set_id') continue // set_id not updatable; refs stay with their owning set
    if (req.body[f] !== undefined) { sets.push(`${f} = ?`); values.push(req.body[f]) }
  }
  if (sets.length === 0) return res.json({ ok: true })
  sets.push("updated_at = datetime('now')")
  values.push(req.params.rid)
  db.prepare(`UPDATE refs SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  const row = db.prepare('SELECT * FROM refs WHERE id = ?').get(req.params.rid)
  res.json(row)
})

// DELETE /api/projects/:pid/refs/:rid
router.delete('/projects/:pid/refs/:rid', (req, res) => {
  const project = getOwnedProject(req.user.id, req.params.pid)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  const result = db.prepare(
    'DELETE FROM refs WHERE id = ? AND project_id = ?'
  ).run(req.params.rid, project.id)
  if (result.changes === 0) return res.status(404).json({ error: 'Reference not found' })
  res.json({ ok: true })
})

export default router
