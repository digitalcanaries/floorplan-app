import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

// Import routes
import authRoutes from './routes/auth.js'
import projectRoutes from './routes/projects.js'
import adminRoutes from './routes/admin.js'
import componentRoutes from './routes/components.js'

// Import db to ensure tables are created on startup
import './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3080

// Body parsing
app.use(express.json({ limit: '50mb' }))

// API routes
app.use('/api', authRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/components', componentRoutes)

// Serve static frontend (Vite build output)
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath, {
  // Cache hashed assets forever, no-cache for everything else
  setHeaders(res, filePath) {
    if (filePath.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    }
  }
}))

// SPA fallback — serve index.html for all non-API routes
app.get('/{*path}', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Floorplan server running on port ${PORT}`)
})
