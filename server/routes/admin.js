import { Router } from 'express'
import bcrypt from 'bcryptjs'
import db from '../db.js'
import { requireAuth, requireAdmin } from '../auth.js'

const router = Router()

// All routes require admin
router.use(requireAuth, requireAdmin)

// GET /api/admin/users — list all users
router.get('/users', (req, res) => {
  const users = db.prepare(
    'SELECT id, username, display_name, is_admin, created_at FROM users ORDER BY created_at DESC'
  ).all()
  res.json(users)
})

// POST /api/admin/users — create user
router.post('/users', (req, res) => {
  const { username, password, display_name } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' })
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' })
  }

  // Check if username already exists
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) return res.status(409).json({ error: 'Username already exists' })

  const hash = bcrypt.hashSync(password, 10)
  const result = db.prepare(
    'INSERT INTO users (username, password, display_name, must_change_password) VALUES (?, ?, ?, 1)'
  ).run(username, hash, display_name || username)

  res.status(201).json({
    id: result.lastInsertRowid,
    username,
    display_name: display_name || username,
  })
})

// DELETE /api/admin/users/:id — delete user (cannot delete self)
router.delete('/users/:id', (req, res) => {
  const userId = parseInt(req.params.id)
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' })
  }

  const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId)
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' })

  res.json({ message: 'User deleted' })
})

// POST /api/admin/users/:id/reset-password — reset user's password
router.post('/users/:id/reset-password', (req, res) => {
  const { password } = req.body
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' })
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })

  const hash = bcrypt.hashSync(password, 10)
  db.prepare('UPDATE users SET password = ?, must_change_password = 1 WHERE id = ?').run(hash, req.params.id)

  res.json({ message: 'Password reset' })
})

export default router
