// Geometry utilities for overlap detection and polygon building

/**
 * Get axis-aligned bounding box for a set in pixel coordinates.
 * Swaps w/h for 90/270 rotation.
 */
export function getAABB(set, ppu) {
  const w = set.width * ppu
  const h = set.height * ppu
  const isRotated = (set.rotation || 0) % 180 !== 0
  return {
    x: set.x,
    y: set.y,
    w: isRotated ? h : w,
    h: isRotated ? w : h,
    id: set.id,
  }
}

/**
 * Compute intersection rectangle of two AABBs.
 * Returns { x, y, w, h } or null if no overlap.
 */
export function getOverlapRect(a, b) {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w)
  const y2 = Math.min(a.y + a.h, b.y + b.h)
  if (x2 <= x1 || y2 <= y1) return null
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

/**
 * Convert a canvas-pixel overlap rectangle into a local-space cutout
 * for a target set, in real-world units. Accounts for rotation (0/90/180/270).
 */
export function canvasOverlapToLocalCutout(overlapRect, targetSet, ppu) {
  const rot = (targetSet.rotation || 0) % 360
  const setW = targetSet.width
  const setH = targetSet.height

  // Canvas-space offset from the set's origin, in real units
  const dx = (overlapRect.x - targetSet.x) / ppu
  const dy = (overlapRect.y - targetSet.y) / ppu
  const ow = overlapRect.w / ppu
  const oh = overlapRect.h / ppu

  switch (rot) {
    case 0:
      return { x: dx, y: dy, w: ow, h: oh }
    case 90:
      return { x: dy, y: setH - dx - ow, w: oh, h: ow }
    case 180:
      return { x: setW - dx - ow, y: setH - dy - oh, w: ow, h: oh }
    case 270:
      return { x: setW - dy - oh, y: dx, w: oh, h: ow }
    default:
      return { x: dx, y: dy, w: ow, h: oh }
  }
}

/**
 * Build polygon vertices from a rectangle minus cutout rectangles.
 * All coordinates in real units, local space.
 * Returns array of {x, y} points wound clockwise.
 */
export function buildCutPolygon(width, height, cutouts) {
  if (!cutouts || cutouts.length === 0) {
    return [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ]
  }

  // Apply each cutout one at a time
  let points = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]

  for (const cut of cutouts) {
    points = applyCutout(points, cut)
  }

  return points
}

/**
 * Apply a single rectangular cutout to a clockwise polygon.
 * Uses Sutherland-Hodgman-like clipping but inverted (subtract the rect).
 *
 * For the simple case of axis-aligned rect-from-rect, we directly compute
 * the result polygon by walking the outer boundary of (polygon minus cutout).
 */
function applyCutout(polyPoints, cut) {
  // Get the bounding box of the polygon
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of polyPoints) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }

  // Clamp the cutout to the polygon bounds
  const cx1 = Math.max(minX, cut.x)
  const cy1 = Math.max(minY, cut.y)
  const cx2 = Math.min(maxX, cut.x + cut.w)
  const cy2 = Math.min(maxY, cut.y + cut.h)

  if (cx2 - cx1 < 0.01 || cy2 - cy1 < 0.01) return polyPoints

  // Collect unique X and Y coordinates to form a grid
  const xCoords = new Set()
  const yCoords = new Set()
  for (const p of polyPoints) { xCoords.add(round(p.x)); yCoords.add(round(p.y)) }
  xCoords.add(round(cx1)); xCoords.add(round(cx2))
  yCoords.add(round(cy1)); yCoords.add(round(cy2))

  const xs = [...xCoords].sort((a, b) => a - b)
  const ys = [...yCoords].sort((a, b) => a - b)

  const cols = xs.length - 1
  const rows = ys.length - 1
  if (cols <= 0 || rows <= 0) return polyPoints

  // Build grid: mark cells as filled if inside the polygon but NOT inside the cutout
  const grid = []
  for (let r = 0; r < rows; r++) {
    grid[r] = []
    for (let c = 0; c < cols; c++) {
      const mx = (xs[c] + xs[c + 1]) / 2
      const my = (ys[r] + ys[r + 1]) / 2
      const inPoly = pointInPolygon(mx, my, polyPoints)
      const inCut = mx > cx1 - 0.001 && mx < cx2 + 0.001 && my > cy1 - 0.001 && my < cy2 + 0.001
      grid[r][c] = inPoly && !inCut
    }
  }

  // Trace the boundary of filled cells clockwise
  return traceBoundary(grid, xs, ys, cols, rows)
}

/**
 * Point-in-polygon test using ray casting.
 */
function pointInPolygon(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Trace the outer boundary of filled grid cells clockwise.
 * Returns array of {x, y} polygon points.
 */
function traceBoundary(grid, xs, ys, cols, rows) {
  const isFilled = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c]

  // Collect boundary edges (between filled and non-filled cells, or at grid edge)
  // Each edge is stored as [x1, y1, x2, y2] going clockwise
  const edges = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!grid[r][c]) continue
      // Top edge: if cell above is not filled
      if (!isFilled(r - 1, c)) {
        edges.push({ x1: xs[c], y1: ys[r], x2: xs[c + 1], y2: ys[r] })
      }
      // Right edge: if cell to right is not filled
      if (!isFilled(r, c + 1)) {
        edges.push({ x1: xs[c + 1], y1: ys[r], x2: xs[c + 1], y2: ys[r + 1] })
      }
      // Bottom edge: if cell below is not filled
      if (!isFilled(r + 1, c)) {
        edges.push({ x1: xs[c + 1], y1: ys[r + 1], x2: xs[c], y2: ys[r + 1] })
      }
      // Left edge: if cell to left is not filled
      if (!isFilled(r, c - 1)) {
        edges.push({ x1: xs[c], y1: ys[r + 1], x2: xs[c], y2: ys[r] })
      }
    }
  }

  if (edges.length === 0) return []

  // Chain edges into a polygon by matching endpoints
  const points = []
  const used = new Array(edges.length).fill(false)

  // Start from the first edge
  let current = edges[0]
  used[0] = true
  points.push({ x: current.x1, y: current.y1 })

  for (let iter = 0; iter < edges.length; iter++) {
    // Find next edge that starts where current ends
    let found = false
    for (let i = 0; i < edges.length; i++) {
      if (used[i]) continue
      if (Math.abs(edges[i].x1 - current.x2) < 0.001 && Math.abs(edges[i].y1 - current.y2) < 0.001) {
        // Skip collinear points (same direction)
        const lastPt = points[points.length - 1]
        const newPt = { x: edges[i].x1, y: edges[i].y1 }
        if (points.length >= 2) {
          const prevPt = points[points.length - 2]
          const dx1 = lastPt.x - prevPt.x, dy1 = lastPt.y - prevPt.y
          const dx2 = newPt.x - lastPt.x, dy2 = newPt.y - lastPt.y
          // If same direction, skip this point (it's collinear)
          if (Math.abs(dx1 * dy2 - dy1 * dx2) < 0.001) {
            points[points.length - 1] = newPt
          } else {
            points.push(newPt)
          }
        } else {
          points.push(newPt)
        }

        current = edges[i]
        used[i] = true
        found = true
        break
      }
    }
    if (!found) break
  }

  // Remove last point if it duplicates the first (closed polygon)
  if (points.length > 1) {
    const f = points[0], l = points[points.length - 1]
    if (Math.abs(f.x - l.x) < 0.001 && Math.abs(f.y - l.y) < 0.001) {
      points.pop()
    }
  }

  // Also check if last-to-first is collinear with second-to-last
  if (points.length >= 3) {
    const prev = points[points.length - 2]
    const last = points[points.length - 1]
    const first = points[0]
    const dx1 = last.x - prev.x, dy1 = last.y - prev.y
    const dx2 = first.x - last.x, dy2 = first.y - last.y
    if (Math.abs(dx1 * dy2 - dy1 * dx2) < 0.001) {
      points.pop()
    }
  }

  return points
}

/**
 * Get label position relative to a set's bounding box.
 * Returns { left, top, originX } for fabric.js text positioning.
 */
export function getLabelPosition(aabb, position, totalHeight) {
  const { x, y, w, h } = aabb
  const pad = 4
  switch (position) {
    case 'center':       return { left: x + w / 2, top: y + (h - totalHeight) / 2, originX: 'center' }
    case 'top':          return { left: x + w / 2, top: y + pad, originX: 'center' }
    case 'top-right':    return { left: x + w - pad, top: y + pad, originX: 'right' }
    case 'left':         return { left: x + pad, top: y + (h - totalHeight) / 2, originX: 'left' }
    case 'right':        return { left: x + w - pad, top: y + (h - totalHeight) / 2, originX: 'right' }
    case 'bottom-left':  return { left: x + pad, top: y + h - pad - totalHeight, originX: 'left' }
    case 'bottom':       return { left: x + w / 2, top: y + h - pad - totalHeight, originX: 'center' }
    case 'bottom-right': return { left: x + w - pad, top: y + h - pad - totalHeight, originX: 'right' }
    case 'top-left':
    default:             return { left: x + pad, top: y + pad, originX: 'left' }
  }
}

function round(v) {
  return Math.round(v * 1000) / 1000
}
