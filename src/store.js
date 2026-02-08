import { create } from 'zustand'

const AUTOSAVE_KEY = 'floorplan-app-autosave'
const SAVES_KEY = 'floorplan-app-saves'

function loadAutosave() {
  try {
    const data = localStorage.getItem(AUTOSAVE_KEY)
    if (data) return JSON.parse(data)
  } catch (e) { /* ignore */ }
  return null
}

function loadSavedProjects() {
  try {
    const data = localStorage.getItem(SAVES_KEY)
    if (data) return JSON.parse(data)
  } catch (e) { /* ignore */ }
  return {}
}

const saved = loadAutosave()

const useStore = create((set, get) => ({
  // PDF / Canvas state
  pdfImage: saved?.pdfImage || null,
  pdfRotation: saved?.pdfRotation || 0,
  pdfPosition: saved?.pdfPosition || { x: 0, y: 0 },
  pixelsPerUnit: saved?.pixelsPerUnit || 1,
  unit: saved?.unit || 'ft',
  gridVisible: saved?.gridVisible ?? true,
  snapToGrid: saved?.snapToGrid ?? true,
  snapToSets: saved?.snapToSets ?? true,
  gridSize: saved?.gridSize || 50,
  labelsVisible: saved?.labelsVisible ?? true,

  // Project info
  projectName: saved?.projectName || 'Untitled Project',
  lastSaved: saved?.lastSaved || null,

  // Sets
  sets: saved?.sets || [],
  nextSetId: saved?.nextSetId || 1,

  // Rules
  rules: saved?.rules || [],
  nextRuleId: saved?.nextRuleId || 1,

  // UI state
  sidebarTab: 'sets',
  calibrating: false,
  calibrationPoints: [],
  selectedSetId: null,

  // PDF actions
  setPdfImage: (img) => set({ pdfImage: img }),
  setPdfRotation: (r) => set({ pdfRotation: r }),
  setPdfPosition: (pos) => {
    const oldPos = get().pdfPosition
    const dx = pos.x - oldPos.x
    const dy = pos.y - oldPos.y
    // Move all locked-to-PDF sets with the PDF
    const updatedSets = get().sets.map(s =>
      s.lockedToPdf ? { ...s, x: s.x + dx, y: s.y + dy } : s
    )
    set({ pdfPosition: pos, sets: updatedSets })
    get().autosave()
  },
  setPixelsPerUnit: (p) => {
    set({ pixelsPerUnit: p })
    get().autosave()
  },
  setUnit: (u) => {
    set({ unit: u })
    get().autosave()
  },
  setGridVisible: (v) => {
    set({ gridVisible: v })
    get().autosave()
  },
  setSnapToGrid: (v) => {
    set({ snapToGrid: v })
    get().autosave()
  },
  setSnapToSets: (v) => {
    set({ snapToSets: v })
    get().autosave()
  },
  setLabelsVisible: (v) => {
    set({ labelsVisible: v })
    get().autosave()
  },
  setGridSize: (s) => {
    set({ gridSize: s })
    get().autosave()
  },

  // Project name
  setProjectName: (name) => {
    set({ projectName: name })
    get().autosave()
  },

  // Calibration
  setCalibrating: (v) => set({ calibrating: v, calibrationPoints: [] }),
  addCalibrationPoint: (pt) => {
    const points = [...get().calibrationPoints, pt]
    set({ calibrationPoints: points })
    return points
  },

  // Sidebar
  setSidebarTab: (t) => set({ sidebarTab: t }),
  setSelectedSetId: (id) => set({ selectedSetId: id }),

  // Set CRUD
  addSet: (s) => {
    const id = get().nextSetId
    const newSet = {
      ...s, id, x: 100, y: 100, rotation: 0, lockedToPdf: false, onPlan: true,
      category: s.category || 'Set', noCut: s.noCut ?? false, labelHidden: false,
      wallGap: s.wallGap || 0, opacity: s.opacity ?? 1, zIndex: s.zIndex ?? 0,
    }
    set({ sets: [...get().sets, newSet], nextSetId: id + 1, selectedSetId: id })
    get().autosave()
    return id
  },
  bulkAddSets: (newSets) => {
    let nextId = get().nextSetId
    const created = newSets.map((s, i) => ({
      ...s,
      id: nextId + i,
      x: 50 + (i % 4) * 120,
      y: 50 + Math.floor(i / 4) * 120,
      rotation: 0,
      lockedToPdf: false,
      onPlan: true,
      category: s.category || 'Set', noCut: s.noCut ?? false, labelHidden: false,
      wallGap: s.wallGap || 0, opacity: s.opacity ?? 1, zIndex: s.zIndex ?? 0,
    }))
    set({
      sets: [...get().sets, ...created],
      nextSetId: nextId + newSets.length,
    })
    get().autosave()
  },
  updateSet: (id, updates) => {
    set({ sets: get().sets.map(s => s.id === id ? { ...s, ...updates } : s) })
    get().autosave()
  },
  deleteSet: (id) => {
    set({
      sets: get().sets.filter(s => s.id !== id),
      rules: get().rules.filter(r => r.setA !== id && r.setB !== id),
      selectedSetId: get().selectedSetId === id ? null : get().selectedSetId,
    })
    get().autosave()
  },
  setSets: (sets) => {
    set({ sets })
    get().autosave()
  },

  // Duplicate a set — auto-increments name with number suffix
  duplicateSet: (id) => {
    const state = get()
    const original = state.sets.find(s => s.id === id)
    if (!original) return

    // Find the next number suffix for this base name
    const baseName = original.name.replace(/\s*\(\d+\)\s*$/, '')
    const existing = state.sets.filter(s => s.name.startsWith(baseName))
    let maxNum = 0
    for (const s of existing) {
      const match = s.name.match(/\((\d+)\)\s*$/)
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]))
    }
    const newName = `${baseName} (${maxNum + 1})`

    const newId = state.nextSetId
    const newSet = {
      ...original,
      id: newId,
      name: newName,
      x: original.x + 30,
      y: original.y + 30,
      lockedToPdf: false,
      cutouts: original.cutouts ? JSON.parse(JSON.stringify(original.cutouts)) : undefined,
    }
    // Remove offset fields from duplicate
    delete newSet.pdfOffsetX
    delete newSet.pdfOffsetY

    set({
      sets: [...state.sets, newSet],
      nextSetId: newId + 1,
      selectedSetId: newId,
    })
    get().autosave()
    return newId
  },

  // Remove set from the plan (hide from canvas) but keep in set list
  removeSetFromPlan: (id) => {
    set({
      sets: get().sets.map(s =>
        s.id === id ? { ...s, onPlan: false, lockedToPdf: false } : s
      ),
    })
    get().autosave()
  },

  // Add set back to the plan
  addSetToPlan: (id) => {
    set({
      sets: get().sets.map(s =>
        s.id === id ? { ...s, onPlan: true, x: 100, y: 100 } : s
      ),
    })
    get().autosave()
  },

  // Hide set from plan but keep its position (for toggling visibility)
  hideSet: (id) => {
    set({
      sets: get().sets.map(s =>
        s.id === id ? { ...s, hidden: true } : s
      ),
    })
    get().autosave()
  },

  // Show a hidden set (restore visibility at same position)
  showSet: (id) => {
    set({
      sets: get().sets.map(s =>
        s.id === id ? { ...s, hidden: false } : s
      ),
    })
    get().autosave()
  },

  // Cut one set into another: cutterSetId cuts into targetSetId
  cutIntoSet: (cutterSetId, targetSetId) => {
    const state = get()
    const cutter = state.sets.find(s => s.id === cutterSetId)
    const target = state.sets.find(s => s.id === targetSetId)
    if (!cutter || !target) return
    if (target.noCut) return // noCut sets cannot be cut into

    const ppu = state.pixelsPerUnit

    // Get AABBs for both sets
    const getAABB = (s) => {
      const w = s.width * ppu
      const h = s.height * ppu
      const isRotated = (s.rotation || 0) % 180 !== 0
      return { x: s.x, y: s.y, w: isRotated ? h : w, h: isRotated ? w : h }
    }

    const cutterRect = getAABB(cutter)
    const targetRect = getAABB(target)

    // Compute overlap
    const ox1 = Math.max(cutterRect.x, targetRect.x)
    const oy1 = Math.max(cutterRect.y, targetRect.y)
    const ox2 = Math.min(cutterRect.x + cutterRect.w, targetRect.x + targetRect.w)
    const oy2 = Math.min(cutterRect.y + cutterRect.h, targetRect.y + targetRect.h)

    if (ox2 <= ox1 || oy2 <= oy1) return // no overlap

    const overlapRect = { x: ox1, y: oy1, w: ox2 - ox1, h: oy2 - oy1 }

    // Convert overlap to target's local coordinate space
    const rot = (target.rotation || 0) % 360
    const dx = (overlapRect.x - target.x) / ppu
    const dy = (overlapRect.y - target.y) / ppu
    const ow = overlapRect.w / ppu
    const oh = overlapRect.h / ppu

    let cutout
    switch (rot) {
      case 0: cutout = { x: dx, y: dy, w: ow, h: oh }; break
      case 90: cutout = { x: dy, y: target.height - dx - ow, w: oh, h: ow }; break
      case 180: cutout = { x: target.width - dx - ow, y: target.height - dy - oh, w: ow, h: oh }; break
      case 270: cutout = { x: target.width - dy - oh, y: dx, w: oh, h: ow }; break
      default: cutout = { x: dx, y: dy, w: ow, h: oh }
    }

    if (cutout.w < 0.3 || cutout.h < 0.3) return // too small

    const existingCutouts = target.cutouts || []
    set({
      sets: state.sets.map(s =>
        s.id === targetSetId ? { ...s, cutouts: [...existingCutouts, cutout] } : s
      ),
    })
    get().autosave()
  },

  // Lock/Unlock set to PDF position
  toggleLockToPdf: (id) => {
    const state = get()
    const pdfPos = state.pdfPosition
    const updatedSets = state.sets.map(s => {
      if (s.id !== id) return s
      if (s.lockedToPdf) {
        // Unlocking — keep current absolute position, remove offset data
        const { pdfOffsetX, pdfOffsetY, ...rest } = s
        return { ...rest, lockedToPdf: false }
      } else {
        // Locking — store the offset from PDF origin
        return {
          ...s,
          lockedToPdf: true,
          pdfOffsetX: s.x - pdfPos.x,
          pdfOffsetY: s.y - pdfPos.y,
        }
      }
    })
    set({ sets: updatedSets })
    get().autosave()
  },

  // Clear cutouts from a set (restore to full rectangle)
  clearCutouts: (id) => {
    set({
      sets: get().sets.map(s =>
        s.id === id ? { ...s, cutouts: undefined } : s
      ),
    })
    get().autosave()
  },

  // Z-order control
  bringForward: (id) => {
    const sets = get().sets
    const maxZ = Math.max(...sets.map(s => s.zIndex || 0))
    set({ sets: sets.map(s => s.id === id ? { ...s, zIndex: (s.zIndex || 0) + 1 } : s) })
    get().autosave()
  },
  sendBackward: (id) => {
    set({ sets: get().sets.map(s => s.id === id ? { ...s, zIndex: Math.max(0, (s.zIndex || 0) - 1) } : s) })
    get().autosave()
  },
  bringToFront: (id) => {
    const maxZ = Math.max(...get().sets.map(s => s.zIndex || 0))
    set({ sets: get().sets.map(s => s.id === id ? { ...s, zIndex: maxZ + 1 } : s) })
    get().autosave()
  },
  sendToBack: (id) => {
    set({ sets: get().sets.map(s => s.id === id ? { ...s, zIndex: 0 } : s) })
    get().autosave()
  },

  // Lock/Unlock all on-plan sets to PDF
  lockAllToPdf: () => {
    const state = get()
    const pdfPos = state.pdfPosition
    const updatedSets = state.sets.map(s => {
      if (s.onPlan === false || s.lockedToPdf) return s
      return {
        ...s,
        lockedToPdf: true,
        pdfOffsetX: s.x - pdfPos.x,
        pdfOffsetY: s.y - pdfPos.y,
      }
    })
    set({ sets: updatedSets })
    get().autosave()
  },

  unlockAllFromPdf: () => {
    const updatedSets = get().sets.map(s => {
      if (!s.lockedToPdf) return s
      const { pdfOffsetX, pdfOffsetY, ...rest } = s
      return { ...rest, lockedToPdf: false }
    })
    set({ sets: updatedSets })
    get().autosave()
  },

  // Rule CRUD
  addRule: (r) => {
    const id = get().nextRuleId
    set({ rules: [...get().rules, { ...r, id }], nextRuleId: id + 1 })
    get().autosave()
    return id
  },
  updateRule: (id, updates) => {
    set({ rules: get().rules.map(r => r.id === id ? { ...r, ...updates } : r) })
    get().autosave()
  },
  deleteRule: (id) => {
    set({ rules: get().rules.filter(r => r.id !== id) })
    get().autosave()
  },

  // Save/Load
  autosave: () => {
    const state = get()
    const now = new Date().toISOString()
    set({ lastSaved: now })
    const data = {
      projectName: state.projectName,
      lastSaved: now,
      pdfImage: state.pdfImage,
      pdfRotation: state.pdfRotation,
      pdfPosition: state.pdfPosition,
      pixelsPerUnit: state.pixelsPerUnit,
      unit: state.unit,
      gridVisible: state.gridVisible,
      snapToGrid: state.snapToGrid,
      snapToSets: state.snapToSets,
      gridSize: state.gridSize,
      labelsVisible: state.labelsVisible,
      sets: state.sets,
      nextSetId: state.nextSetId,
      rules: state.rules,
      nextRuleId: state.nextRuleId,
    }
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data))
    } catch (e) { /* ignore quota errors */ }
  },

  // Named project saves (stored in localStorage)
  saveProjectAs: (name) => {
    const state = get()
    set({ projectName: name })
    const data = {
      projectName: name,
      lastSaved: new Date().toISOString(),
      pdfImage: state.pdfImage,
      pdfRotation: state.pdfRotation,
      pdfPosition: state.pdfPosition,
      pixelsPerUnit: state.pixelsPerUnit,
      unit: state.unit,
      gridVisible: state.gridVisible,
      snapToGrid: state.snapToGrid,
      snapToSets: state.snapToSets,
      gridSize: state.gridSize,
      labelsVisible: state.labelsVisible,
      sets: state.sets,
      nextSetId: state.nextSetId,
      rules: state.rules,
      nextRuleId: state.nextRuleId,
    }
    try {
      const saves = loadSavedProjects()
      saves[name] = data
      localStorage.setItem(SAVES_KEY, JSON.stringify(saves))
    } catch (e) { /* ignore */ }
    get().autosave()
  },

  getSavedProjects: () => {
    return loadSavedProjects()
  },

  loadSavedProject: (name) => {
    const saves = loadSavedProjects()
    const data = saves[name]
    if (data) {
      get().importProject(data)
      set({ projectName: name })
    }
  },

  deleteSavedProject: (name) => {
    try {
      const saves = loadSavedProjects()
      delete saves[name]
      localStorage.setItem(SAVES_KEY, JSON.stringify(saves))
    } catch (e) { /* ignore */ }
  },

  exportProject: () => {
    const state = get()
    return {
      version: 1,
      projectName: state.projectName,
      pdfImage: state.pdfImage,
      pdfRotation: state.pdfRotation,
      pdfPosition: state.pdfPosition,
      pixelsPerUnit: state.pixelsPerUnit,
      unit: state.unit,
      gridVisible: state.gridVisible,
      snapToGrid: state.snapToGrid,
      snapToSets: state.snapToSets,
      gridSize: state.gridSize,
      labelsVisible: state.labelsVisible,
      sets: state.sets,
      nextSetId: state.nextSetId,
      rules: state.rules,
      nextRuleId: state.nextRuleId,
    }
  },

  importProject: (data) => {
    set({
      projectName: data.projectName || 'Untitled Project',
      pdfImage: data.pdfImage || null,
      pdfRotation: data.pdfRotation || 0,
      pdfPosition: data.pdfPosition || { x: 0, y: 0 },
      pixelsPerUnit: data.pixelsPerUnit || 1,
      unit: data.unit || 'ft',
      gridVisible: data.gridVisible ?? true,
      snapToGrid: data.snapToGrid ?? true,
      snapToSets: data.snapToSets ?? true,
      gridSize: data.gridSize || 50,
      labelsVisible: data.labelsVisible ?? true,
      sets: data.sets || [],
      nextSetId: data.nextSetId || 1,
      rules: data.rules || [],
      nextRuleId: data.nextRuleId || 1,
      selectedSetId: null,
    })
    get().autosave()
  },

  clearAll: () => {
    set({
      projectName: 'Untitled Project',
      lastSaved: null,
      pdfImage: null,
      pdfRotation: 0,
      pdfPosition: { x: 0, y: 0 },
      pixelsPerUnit: 1,
      sets: [],
      nextSetId: 1,
      rules: [],
      nextRuleId: 1,
      selectedSetId: null,
    })
    localStorage.removeItem(AUTOSAVE_KEY)
  },
}))

export default useStore
