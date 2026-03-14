// Scoring engine for layout evaluation

function getRect(set, ppu) {
  const w = set.width * ppu
  const h = set.height * ppu
  const isRotated = (set.rotation || 0) % 180 !== 0
  const rw = isRotated ? h : w
  const rh = isRotated ? w : h
  return { x: set.x, y: set.y, w: rw, h: rh }
}

function rectsOverlap(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
}

function overlapArea(a, b) {
  const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return ox * oy
}

function centerDist(a, b) {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2
  const bx = b.x + b.w / 2, by = b.y + b.h / 2
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}

function edgeDist(a, b) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w))
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h))
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Check if an obstacle overlaps only the edge of a set (within edgeMargin pixels).
 * Returns true if the overlap is at/near an edge — penalty should be lighter.
 */
function isEdgeOverlap(setRect, obsRect, edgeMargin) {
  const ox1 = Math.max(setRect.x, obsRect.x)
  const oy1 = Math.max(setRect.y, obsRect.y)
  const ox2 = Math.min(setRect.x + setRect.w, obsRect.x + obsRect.w)
  const oy2 = Math.min(setRect.y + setRect.h, obsRect.y + obsRect.h)
  if (ox2 <= ox1 || oy2 <= oy1) return true // no overlap at all

  // Check if the overlap region touches any edge of the set
  const nearLeft = ox1 - setRect.x < edgeMargin
  const nearRight = (setRect.x + setRect.w) - ox2 < edgeMargin
  const nearTop = oy1 - setRect.y < edgeMargin
  const nearBottom = (setRect.y + setRect.h) - oy2 < edgeMargin

  return nearLeft || nearRight || nearTop || nearBottom
}

/**
 * Get the clearance zone for a locked component (Window/Door).
 * Returns { x, y, w, h } rect extending outward from the parent set edge,
 * or null if can't determine.
 */
export function getComponentClearance(component, parentSet, ppu, clearanceFt) {
  if (!parentSet) return null
  const pa = getRect(parentSet, ppu)
  const ca = getRect(component, ppu)
  const cx = ca.x + ca.w / 2
  const cy = ca.y + ca.h / 2
  const clearPx = clearanceFt * ppu

  // Determine which parent edge the component is closest to
  const distLeft = Math.abs(cx - pa.x)
  const distRight = Math.abs(cx - (pa.x + pa.w))
  const distTop = Math.abs(cy - pa.y)
  const distBottom = Math.abs(cy - (pa.y + pa.h))
  const minDist = Math.min(distLeft, distRight, distTop, distBottom)

  if (minDist === distLeft) {
    // Component on left edge → clearance extends LEFT
    return { x: ca.x - clearPx, y: ca.y, w: clearPx, h: ca.h }
  } else if (minDist === distRight) {
    // Component on right edge → clearance extends RIGHT
    return { x: ca.x + ca.w, y: ca.y, w: clearPx, h: ca.h }
  } else if (minDist === distTop) {
    // Component on top edge → clearance extends UP
    return { x: ca.x, y: ca.y - clearPx, w: ca.w, h: clearPx }
  } else {
    // Component on bottom edge → clearance extends DOWN
    return { x: ca.x, y: ca.y + ca.h, w: ca.w, h: clearPx }
  }
}

/**
 * Score a layout. Lower = better.
 * @param {Array} sets - All sets to score
 * @param {Array} rules - Layout rules
 * @param {number} ppu - Pixels per unit
 * @param {Array} obstacles - Column + exclusion zone rects [{x,y,w,h}]
 * @param {Object} options - { penaliseBBox: bool }
 */
export function scoreLayout(sets, rules, ppu, obstacles = [], options = {}) {
  let score = 0
  const rects = sets.map(s => ({ ...getRect(s, ppu), id: s.id, category: s.category, lockedToSetId: s.lockedToSetId }))
  const edgeMargin = ppu // ~1 foot in pixels

  // Overlap penalty (set-to-set)
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const area = overlapArea(rects[i], rects[j])
      if (area > 0) score += area * 10
    }
  }

  // Rule penalties
  for (const rule of rules) {
    const a = rects.find(r => r.id === rule.setA)
    const b = rects.find(r => r.id === rule.setB)
    if (!a || !b) continue

    const dist = centerDist(a, b)
    const edge = edgeDist(a, b)
    const threshold = (rule.distance || 100) * ppu

    switch (rule.type) {
      case 'NEAR':
        if (dist > threshold) score += (dist - threshold) * 2
        break
      case 'CONNECT':
        if (edge > 5) score += edge * 5
        break
      case 'SEPARATE':
        if (dist < threshold) score += (threshold - dist) * 3
        break
    }
  }

  // Crawl space penalty — enforce minimum gap between non-component sets
  const COMPONENT_CATS = ['Wall', 'Window', 'Door']
  const crawlPx = (options.crawlSpace || 0) * ppu
  if (crawlPx > 0) {
    for (let i = 0; i < rects.length; i++) {
      if (COMPONENT_CATS.includes(rects[i].category)) continue
      for (let j = i + 1; j < rects.length; j++) {
        if (COMPONENT_CATS.includes(rects[j].category)) continue
        const edge = edgeDist(rects[i], rects[j])
        if (edge < crawlPx && edge >= 0) {
          score += (crawlPx - edge) * 5
        }
      }
    }
  }

  // Obstacle penalties (columns + exclusion zones)
  for (const rect of rects) {
    for (const obs of obstacles) {
      const area = overlapArea(rect, obs)
      if (area > 0) {
        const edge = isEdgeOverlap(rect, obs, edgeMargin)
        score += edge ? area * 2 : area * 50
      }
    }
  }

  // Door/Window clearance penalties
  const components = sets.filter(s => COMPONENT_CATS.includes(s.category) && s.lockedToSetId)
  for (const comp of components) {
    const parent = sets.find(s => s.id === comp.lockedToSetId)
    if (!parent) continue

    if (comp.category === 'Door') {
      // Doors: heavy penalty if any non-parent set overlaps the door's footprint
      const doorRect = getRect(comp, ppu)
      // Extend door clearance 2ft outward
      const clearZone = getComponentClearance(comp, parent, ppu, 2)
      if (clearZone) {
        for (const other of sets) {
          if (other.id === comp.id || other.id === parent.id) continue
          if (COMPONENT_CATS.includes(other.category)) continue // Don't penalise other components
          const area = overlapArea(clearZone, getRect(other, ppu))
          if (area > 0) score += area * 100 // Very heavy — don't block doors
        }
      }
    }

    if (comp.category === 'Window') {
      // Windows: 3ft clearance on outward side
      const clearZone = getComponentClearance(comp, parent, ppu, 3)
      if (clearZone) {
        for (const other of sets) {
          if (other.id === comp.id || other.id === parent.id) continue
          if (COMPONENT_CATS.includes(other.category)) continue
          const area = overlapArea(clearZone, getRect(other, ppu))
          if (area > 0) score += area * 20
        }
      }
    }
  }

  // Optional bounding-box penalty (for compact mode)
  if (options.penaliseBBox && rects.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const r of rects) {
      if (r.x < minX) minX = r.x
      if (r.y < minY) minY = r.y
      if (r.x + r.w > maxX) maxX = r.x + r.w
      if (r.y + r.h > maxY) maxY = r.y + r.h
    }
    score += ((maxX - minX) * (maxY - minY)) * 0.001
  }

  return score
}

export function hasOverlaps(sets, ppu) {
  const rects = sets.map(s => getRect(s, ppu))
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i], rects[j])) return true
    }
  }
  return false
}
