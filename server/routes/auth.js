import { Router } from 'express'
import bcrypt from 'bcryptjs'
import db from '../db.js'
import { signToken, requireAuth } from '../auth.js'

const router = Router()

// POST /api/login
router.post('/login', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' })
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username or password' })
  }

  const token = signToken(user)
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      is_admin: !!user.is_admin,
      must_change_password: !!user.must_change_password,
    },
  })
})

// GET /api/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, is_admin, must_change_password FROM users WHERE id = ?').get(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    is_admin: !!user.is_admin,
    must_change_password: !!user.must_change_password,
  })
})

// POST /api/change-password
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' })
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })

  // If must_change_password, don't require current password
  if (!user.must_change_password) {
    if (!currentPassword || !bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Current password is incorrect' })
    }
  }

  const hash = bcrypt.hashSync(newPassword, 10)
  db.prepare('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?').run(hash, req.user.id)

  // Return a new token since must_change_password may have changed
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  const token = signToken(updated)
  res.json({ message: 'Password changed', token })
})

export default router
