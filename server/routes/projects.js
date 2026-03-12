import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()

// All routes require auth
router.use(requireAuth)

// GET /api/projects — list user's projects (without full data blob)
router.get('/', (req, res) => {
  const projects = db.prepare(
    'SELECT id, name, created_at, updated_at, shared_from FROM projects WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(req.user.id)
  res.json(projects)
})

// GET /api/projects/:id — get full project (owner only)
router.get('/:id', (req, res) => {
  const project = db.prepare(
    'SELECT * FROM projects WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id)
  if (!project) return res.status(404).json({ error: 'Project not found' })

  res.json({
    ...project,
    data: JSON.parse(project.data),
  })
})

// POST /api/projects — create project
router.post('/', (req, res) => {
  const { name, data } = req.body
  if (!name) return res.status(400).json({ error: 'Project name required' })
  if (!data) return res.status(400).json({ error: 'Project data required' })

  const result = db.prepare(
    'INSERT INTO projects (user_id, name, data) VALUES (?, ?, ?)'
  ).run(req.user.id, name, JSON.stringify(data))

  res.status(201).json({ id: result.lastInsertRowid, name })
})

// PUT /api/projects/:id — update project
router.put('/:id', (req, res) => {
  const project = db.prepare(
    'SELECT id FROM projects WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id)
  if (!project) return res.status(404).json({ error: 'Project not found' })

  const { name, data } = req.body
  const updates = []
  const params = []

  if (name) { updates.push('name = ?'); params.push(name) }
  if (data) { updates.push('data = ?'); params.push(JSON.stringify(data)) }
  updates.push("updated_at = datetime('now')")
  params.push(req.params.id)

  db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  res.json({ message: 'Project updated' })
})

// DELETE /api/projects/:id — delete project
router.delete('/:id', (req, res) => {
  const result = db.prepare(
    'DELETE FROM projects WHERE id = ? AND user_id = ?'
  ).run(req.params.id, req.user.id)
  if (result.changes === 0) return res.status(404).json({ error: 'Project not found' })
  res.json({ message: 'Project deleted' })
})

// POST /api/projects/:id/share — copy project to another user
router.post('/:id/share', (req, res) => {
  const { username } = req.body
  if (!username) return res.status(400).json({ error: 'Target username required' })

  // Get the source project (must belong to current user)
  const project = db.prepare(
    'SELECT * FROM projects WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id)
  if (!project) return res.status(404).json({ error: 'Project not found' })

  // Find the target user
  const targetUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (!targetUser) return res.status(404).json({ error: 'User not found' })
  if (targetUser.id === req.user.id) return res.status(400).json({ error: 'Cannot share with yourself' })

  // Create a copy for the target user
  const sharedFrom = `${req.user.username}`
  const result = db.prepare(
    'INSERT INTO projects (user_id, name, data, shared_from) VALUES (?, ?, ?, ?)'
  ).run(targetUser.id, project.name, project.data, sharedFrom)

  res.status(201).json({ message: `Project shared with ${username}`, id: result.lastInsertRowid })
})

export default router
