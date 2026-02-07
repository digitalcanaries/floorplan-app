// Scoring engine for layout evaluation

function getRect(set, ppu) {
  const w = set.width * ppu
  const h = set.height * ppu
  const isRotated = set.rotation % 180 !== 0
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

export function scoreLayout(sets, rules, ppu) {
  let score = 0
  const rects = sets.map(s => ({ ...getRect(s, ppu), id: s.id }))

  // Overlap penalty
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
