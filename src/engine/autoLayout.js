import { scoreLayout } from './scoring.js'

function getSetDims(set, ppu) {
  const w = set.width * ppu
  const h = set.height * ppu
  const isRotated = (set.rotation || 0) % 180 !== 0
  return { w: isRotated ? h : w, h: isRotated ? w : h }
}

/**
 * Build the obstacles array from building columns + exclusion zones.
 * Columns use center-point coordinates; converts to {x, y, w, h} top-left rects.
 */
export function buildObstacles(buildingColumns = [], exclusionZones = [], ppu = 1) {
  const obstacles = []

  // Building columns: stored as center (x, y) with width/height in feet
  for (const col of buildingColumns) {
    const wp = col.width * ppu
    const hp = col.height * ppu
    obstacles.push({
      x: col.x - wp / 2,
      y: col.y - hp / 2,
      w: wp,
      h: hp,
      type: 'column',
    })
  }

  // Exclusion zones: already in canvas pixel coords {x, y, w, h}
  for (const zone of exclusionZones) {
    obstacles.push({
      x: zone.x,
      y: zone.y,
      w: zone.w,
      h: zone.h,
      type: 'exclusion',
    })
  }

  return obstacles
}

// Simple bin-packing: place sets left-to-right, top-to-bottom
function binPack(sets, ppu, canvasW, canvasH, padding = 20) {
  const sorted = [...sets].sort((a, b) => {
    const da = getSetDims(a, ppu)
    const db = getSetDims(b, ppu)
    return (db.w * db.h) - (da.w * da.h)
  })

  let curX = padding
  let curY = padding
  let rowH = 0
  const maxW = canvasW || 2000

  return sorted.map(set => {
    // Don't reposition fixed or locked sets
    if (set.fixed) return set
    const dims = getSetDims(set, ppu)
    if (curX + dims.w + padding > maxW && curX > padding) {
      curX = padding
      curY += rowH + padding
      rowH = 0
    }
    const placed = { ...set, x: curX, y: curY }
    curX += dims.w + padding
    rowH = Math.max(rowH, dims.h)
    return placed
  })
}

// Bin-pack grouped by category
function binPackByCategory(sets, ppu, canvasW, canvasH, padding = 20) {
  const categoryOrder = ['Set', 'Furniture', 'Other', 'Wall', 'Window', 'Door']
  const groups = {}
  for (const cat of categoryOrder) groups[cat] = []
  for (const s of sets) {
    const cat = s.category || 'Set'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(s)
  }

  // Sort each group by size (largest first)
  for (const cat of Object.keys(groups)) {
    groups[cat].sort((a, b) => {
      const da = getSetDims(a, ppu)
      const db = getSetDims(b, ppu)
      return (db.w * db.h) - (da.w * da.h)
    })
  }

  // Pack groups sequentially — each group starts a new row
  let curX = padding
  let curY = padding
  let rowH = 0
  const maxW = canvasW || 2000
  const result = []

  for (const cat of categoryOrder) {
    if (!groups[cat] || groups[cat].length === 0) continue
    // Start new row for each category
    if (curX > padding) {
      curX = padding
      curY += rowH + padding * 2
      rowH = 0
    }
    for (const set of groups[cat]) {
      if (set.fixed) { result.push(set); continue }
      const dims = getSetDims(set, ppu)
      if (curX + dims.w + padding > maxW && curX > padding) {
        curX = padding
        curY += rowH + padding
        rowH = 0
      }
      result.push({ ...set, x: curX, y: curY })
      curX += dims.w + padding
      rowH = Math.max(rowH, dims.h)
    }
  }

  return result
}

// Random perturbation of positions, with optional obstacle avoidance bias
function perturb(sets, ppu, magnitude, obstacles = []) {
  return sets.map(set => {
    // Don't move FIXED or locked-to-PDF sets
    if (set.fixed) return set
    let newX = Math.max(0, set.x + (Math.random() - 0.5) * magnitude)
    let newY = Math.max(0, set.y + (Math.random() - 0.5) * magnitude)

    // If obstacles present, add slight bias away from overlapping obstacles
    if (obstacles.length > 0) {
      const dims = getSetDims(set, ppu)
      const setRect = { x: newX, y: newY, w: dims.w, h: dims.h }
      for (const obs of obstacles) {
        const ox = Math.max(0, Math.min(setRect.x + setRect.w, obs.x + obs.w) - Math.max(setRect.x, obs.x))
        const oy = Math.max(0, Math.min(setRect.y + setRect.h, obs.y + obs.h) - Math.max(setRect.y, obs.y))
        if (ox > 0 && oy > 0) {
          // Push away from obstacle center
          const setCx = newX + dims.w / 2
          const setCy = newY + dims.h / 2
          const obsCx = obs.x + obs.w / 2
          const obsCy = obs.y + obs.h / 2
          const pushX = setCx > obsCx ? magnitude * 0.3 : -magnitude * 0.3
          const pushY = setCy > obsCy ? magnitude * 0.3 : -magnitude * 0.3
          newX = Math.max(0, newX + pushX)
          newY = Math.max(0, newY + pushY)
        }
      }
    }

    return { ...set, x: newX, y: newY }
  })
}

/**
 * Prepare sets for layout: mark fixed, filter on/off plan.
 */
function prepareSets(sets, rules) {
  const onPlan = sets.filter(s => s.onPlan !== false)
  const offPlan = sets.filter(s => s.onPlan === false)

  const fixedIds = new Set()
  for (const rule of rules) {
    if (rule.type === 'FIXED') {
      fixedIds.add(rule.setA)
      if (rule.setB) fixedIds.add(rule.setB)
    }
  }

  const markedSets = onPlan.map(s => ({
    ...s,
    fixed: fixedIds.has(s.id) || s.lockedToPdf,
  }))

  return { markedSets, offPlan, onPlan }
}

/**
 * Run optimisation iterations on a candidate layout.
 */
function optimise(initial, onPlan, rules, ppu, iterations, obstacles, options = {}) {
  // Restore fixed positions
  let best = initial.map(s => {
    if (s.fixed) {
      const original = onPlan.find(o => o.id === s.id)
      return { ...s, x: original.x, y: original.y }
    }
    return s
  })

  let bestScore = scoreLayout(best, rules, ppu, obstacles, options)

  for (let i = 0; i < iterations; i++) {
    const magnitude = Math.max(20, 200 * (1 - i / iterations))
    const candidate = perturb(best, ppu, magnitude, obstacles)
    const candidateScore = scoreLayout(candidate, rules, ppu, obstacles, options)
    if (candidateScore < bestScore) {
      best = candidate
      bestScore = candidateScore
    }
  }

  return { best, bestScore }
}

/**
 * Clean up temp fixed flag and merge back with off-plan sets.
 */
function finalise(best, offPlan) {
  const result = best.map(s => {
    const { fixed, ...rest } = s
    return rest
  })
  return [...result, ...offPlan]
}

// --- PUBLIC STRATEGIES ---

export function autoLayout(sets, rules, ppu, canvasW, canvasH, obstacles = [], options = {}) {
  if (sets.length === 0) return sets
  const { markedSets, offPlan, onPlan } = prepareSets(sets, rules)
  if (markedSets.length === 0) return sets

  const crawlPad = Math.max(20, (options.crawlSpace || 0) * ppu)
  const initial = binPack(markedSets, ppu, canvasW, canvasH, crawlPad)
  const { best } = optimise(initial, onPlan, rules, ppu, 100, obstacles, options)
  return finalise(best, offPlan)
}

export function tryAlternate(sets, rules, ppu, canvasW, canvasH, obstacles = [], options = {}) {
  const shuffled = [...sets].sort(() => Math.random() - 0.5)
  return autoLayout(shuffled, rules, ppu, canvasW, canvasH, obstacles, options)
}

export function layoutByCategory(sets, rules, ppu, canvasW, canvasH, obstacles = [], options = {}) {
  if (sets.length === 0) return sets
  const { markedSets, offPlan, onPlan } = prepareSets(sets, rules)
  if (markedSets.length === 0) return sets

  const crawlPad = Math.max(20, (options.crawlSpace || 0) * ppu)
  const initial = binPackByCategory(markedSets, ppu, canvasW, canvasH, crawlPad)
  const { best } = optimise(initial, onPlan, rules, ppu, 120, obstacles, options)
  return finalise(best, offPlan)
}

export function layoutCompact(sets, rules, ppu, canvasW, canvasH, obstacles = [], options = {}) {
  if (sets.length === 0) return sets
  const { markedSets, offPlan, onPlan } = prepareSets(sets, rules)
  if (markedSets.length === 0) return sets

  const crawlPad = Math.max(10, (options.crawlSpace || 0) * ppu * 0.5) // Tighter but still respects crawl
  const initial = binPack(markedSets, ppu, canvasW, canvasH, crawlPad)
  const { best } = optimise(initial, onPlan, rules, ppu, 200, obstacles, { ...options, penaliseBBox: true })
  return finalise(best, offPlan)
}

export function layoutShuffle(sets, rules, ppu, canvasW, canvasH, obstacles = [], options = {}) {
  if (sets.length === 0) return sets
  const { markedSets, offPlan, onPlan } = prepareSets(sets, rules)
  if (markedSets.length === 0) return sets

  const crawlPad = Math.max(20, (options.crawlSpace || 0) * ppu)
  // Run 3 random shuffles, keep best
  let overallBest = null
  let overallBestScore = Infinity

  for (let attempt = 0; attempt < 3; attempt++) {
    const shuffled = [...markedSets].sort(() => Math.random() - 0.5)
    const initial = binPack(shuffled, ppu, canvasW, canvasH, crawlPad)
    const { best, bestScore } = optimise(initial, onPlan, rules, ppu, 150, obstacles, options)
    if (bestScore < overallBestScore) {
      overallBest = best
      overallBestScore = bestScore
    }
  }

  return finalise(overallBest, offPlan)
}
