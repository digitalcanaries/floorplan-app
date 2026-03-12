import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'floorplan-dev-secret-change-me'
const TOKEN_EXPIRY = '7d'

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, is_admin: user.is_admin },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  )
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

// Express middleware — sets req.user or returns 401
export function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }
  try {
    req.user = verifyToken(header.slice(7))
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Express middleware — requires admin
export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}
