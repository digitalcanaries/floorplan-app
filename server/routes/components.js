import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()

router.use(requireAuth)

// GET /api/components — list defaults + user's custom components
router.get('/', (req, res) => {
  const components = db.prepare(
    'SELECT * FROM component_types WHERE is_default = 1 OR created_by = ? ORDER BY category, subcategory, name'
  ).all(req.user.id)

  // Parse properties JSON
  const parsed = components.map(c => ({
    ...c,
    properties: c.properties ? JSON.parse(c.properties) : {},
  }))

  res.json(parsed)
})

// POST /api/components — create custom component
router.post('/', (req, res) => {
  const { category, subcategory, name, width, height, thickness, icon_type, properties, wallHeight } = req.body
  if (!category || !name || !width || !height) {
    return res.status(400).json({ error: 'Category, name, width, and height are required' })
  }

  const result = db.prepare(
    `INSERT INTO component_types (category, subcategory, name, width, height, thickness, icon_type, properties, is_default, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    category,
    subcategory || null,
    name,
    width,
    height,
    thickness || 0.292,
    icon_type || 'rect',
    properties ? JSON.stringify(properties) : null,
    req.user.id
  )

  res.status(201).json({
    id: result.lastInsertRowid,
    category,
    subcategory,
    name,
    width,
    height,
    wallHeight: wallHeight || null,
    thickness: thickness || 0.292,
    icon_type: icon_type || 'rect',
    properties: properties || {},
    is_default: 0,
    created_by: req.user.id,
  })
})

// DELETE /api/components/:id — delete own custom component
router.delete('/:id', (req, res) => {
  // Only allow deleting user's own custom components (not defaults)
  const result = db.prepare(
    'DELETE FROM component_types WHERE id = ? AND created_by = ? AND is_default = 0'
  ).run(req.params.id, req.user.id)

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Component not found or cannot be deleted' })
  }

  res.json({ message: 'Component deleted' })
})

export default router
