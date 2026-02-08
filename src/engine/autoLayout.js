import { scoreLayout } from './scoring.js'

function getSetDims(set, ppu) {
  const w = set.width * ppu
  const h = set.height * ppu
  const isRotated = set.rotation % 180 !== 0
  return { w: isRotated ? h : w, h: isRotated ? w : h }
}

// Simple bin-packing: place sets left-to-right, top-to-bottom
function binPack(sets, ppu, canvasW, canvasH) {
  const sorted = [...sets].sort((a, b) => {
    const da = getSetDims(a, ppu)
    const db = getSetDims(b, ppu)
    return (db.w * db.h) - (da.w * da.h)
  })

  const padding = 20
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

// Random perturbation of positions
function perturb(sets, ppu, magnitude) {
  return sets.map(set => {
    // Don't move FIXED or locked-to-PDF sets
    if (set.fixed) return set
    return {
      ...set,
      x: Math.max(0, set.x + (Math.random() - 0.5) * magnitude),
      y: Math.max(0, set.y + (Math.random() - 0.5) * magnitude),
    }
  })
}

export function autoLayout(sets, rules, ppu, canvasW, canvasH, iterations = 100) {
  if (sets.length === 0) return sets

  // Only layout sets that are on the plan
  const onPlan = sets.filter(s => s.onPlan !== false)
  const offPlan = sets.filter(s => s.onPlan === false)

  if (onPlan.length === 0) return sets

  // Mark fixed sets based on FIXED rules AND lockedToPdf
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

  // Start with bin-packed layout
  let best = binPack(markedSets, ppu, canvasW, canvasH)
  // Restore fixed positions
  best = best.map(s => {
    if (s.fixed) {
      const original = onPlan.find(o => o.id === s.id)
      return { ...s, x: original.x, y: original.y }
    }
    return s
  })

  let bestScore = scoreLayout(best, rules, ppu)

  // Iterate with random perturbations
  for (let i = 0; i < iterations; i++) {
    const magnitude = Math.max(20, 200 * (1 - i / iterations))
    let candidate = perturb(best, ppu, magnitude)
    const candidateScore = scoreLayout(candidate, rules, ppu)
    if (candidateScore < bestScore) {
      best = candidate
      bestScore = candidateScore
    }
  }

  // Clean up temp fixed flag and merge back with off-plan sets
  const result = best.map(s => {
    const { fixed, ...rest } = s
    return rest
  })

  return [...result, ...offPlan]
}

export function tryAlternate(sets, rules, ppu, canvasW, canvasH) {
  // Shuffle first, then run auto-layout to get a different result
  const shuffled = [...sets].sort(() => Math.random() - 0.5)
  return autoLayout(shuffled, rules, ppu, canvasW, canvasH, 150)
}
