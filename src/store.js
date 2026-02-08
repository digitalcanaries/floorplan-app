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
  labelMode: saved?.labelMode ?? 'inline',
  showOverlaps: saved?.showOverlaps ?? true,
  viewMode: saved?.viewMode ?? 'plan',

  // Undo/redo history (not persisted)
  _past: [],
  _future: [],
  _maxHistory: 50,
  _recording: true,

  // Project info
  projectName: saved?.projectName || 'Untitled Project',
  lastSaved: saved?.lastSaved || null,

  // Sets
  sets: saved?.sets || [],
  nextSetId: saved?.nextSetId || 1,

  // Rules
  rules: saved?.rules || [],
  nextRuleId: saved?.nextRuleId || 1,

  // Annotations (text labels on canvas)
  annotations: saved?.annotations || [],
  nextAnnotationId: saved?.nextAnnotationId || 1,

  // Groups
  groups: saved?.groups || [],
  nextGroupId: saved?.nextGroupId || 1,

  // Layers visibility (by category)
  layerVisibility: saved?.layerVisibility || {},

  // Dimension lines
  showDimensions: saved?.showDimensions ?? false,

  // Clipboard (not persisted)
  _clipboard: null,

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
  setLabelMode: (mode) => {
    set({ labelMode: mode })
    get().autosave()
  },
  setShowOverlaps: (v) => {
    set({ showOverlaps: v })
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

  // View mode
  setViewMode: (mode) => {
    set({ viewMode: mode })
    get().autosave()
  },

  // Undo/redo
  _pushHistory: () => {
    const state = get()
    if (!state._recording) return
    const snapshot = {
      sets: JSON.parse(JSON.stringify(state.sets)),
      rules: JSON.parse(JSON.stringify(state.rules)),
      annotations: JSON.parse(JSON.stringify(state.annotations)),
      groups: JSON.parse(JSON.stringify(state.groups)),
      nextSetId: state.nextSetId,
      nextRuleId: state.nextRuleId,
      nextAnnotationId: state.nextAnnotationId,
      nextGroupId: state.nextGroupId,
    }
    const past = [...state._past, snapshot]
    if (past.length > state._maxHistory) past.shift()
    set({ _past: past, _future: [] })
  },

  undo: () => {
    const { _past, _future, sets, rules, annotations, groups, nextSetId, nextRuleId, nextAnnotationId, nextGroupId } = get()
    if (_past.length === 0) return
    const currentSnapshot = {
      sets: JSON.parse(JSON.stringify(sets)),
      rules: JSON.parse(JSON.stringify(rules)),
      annotations: JSON.parse(JSON.stringify(annotations)),
      groups: JSON.parse(JSON.stringify(groups)),
      nextSetId, nextRuleId, nextAnnotationId, nextGroupId,
    }
    const previous = _past[_past.length - 1]
    set({
      _recording: false,
      sets: JSON.parse(JSON.stringify(previous.sets)),
      rules: JSON.parse(JSON.stringify(previous.rules)),
      annotations: JSON.parse(JSON.stringify(previous.annotations || [])),
      groups: JSON.parse(JSON.stringify(previous.groups || [])),
      nextSetId: previous.nextSetId,
      nextRuleId: previous.nextRuleId,
      nextAnnotationId: previous.nextAnnotationId || get().nextAnnotationId,
      nextGroupId: previous.nextGroupId || get().nextGroupId,
      _past: _past.slice(0, -1),
      _future: [currentSnapshot, ..._future],
      selectedSetId: null,
      _recording: true,
    })
    get().autosave()
  },

  redo: () => {
    const { _past, _future, sets, rules, annotations, groups, nextSetId, nextRuleId, nextAnnotationId, nextGroupId } = get()
    if (_future.length === 0) return
    const currentSnapshot = {
      sets: JSON.parse(JSON.stringify(sets)),
      rules: JSON.parse(JSON.stringify(rules)),
      annotations: JSON.parse(JSON.stringify(annotations)),
      groups: JSON.parse(JSON.stringify(groups)),
      nextSetId, nextRuleId, nextAnnotationId, nextGroupId,
    }
    const next = _future[0]
    set({
      _recording: false,
      sets: JSON.parse(JSON.stringify(next.sets)),
      rules: JSON.parse(JSON.stringify(next.rules)),
      annotations: JSON.parse(JSON.stringify(next.annotations || [])),
      groups: JSON.parse(JSON.stringify(next.groups || [])),
      nextSetId: next.nextSetId,
      nextRuleId: next.nextRuleId,
      nextAnnotationId: next.nextAnnotationId || get().nextAnnotationId,
      nextGroupId: next.nextGroupId || get().nextGroupId,
      _past: [..._past, currentSnapshot],
      _future: _future.slice(1),
      selectedSetId: null,
      _recording: true,
    })
    get().autosave()
  },

  // Sidebar
  setSidebarTab: (t) => set({ sidebarTab: t }),
  setSelectedSetId: (id) => set({ selectedSetId: id }),

  // Set CRUD
  addSet: (s) => {
    get()._pushHistory()
    const id = get().nextSetId
    const maxZ = get().sets.length > 0 ? Math.max(...get().sets.map(s => s.zIndex || 0)) : 0
    const newSet = {
      ...s, id, x: s.x ?? 100, y: s.y ?? 100, rotation: 0, lockedToPdf: false, onPlan: true,
      category: s.category || 'Set', noCut: s.noCut ?? false, labelHidden: false,
      labelPosition: s.labelPosition || 'top-left',
      wallGap: s.wallGap || 0, opacity: s.opacity ?? 1, zIndex: s.zIndex ?? (maxZ + 1),
      iconType: s.iconType || 'rect', thickness: s.thickness ?? null,
      componentTypeId: s.componentTypeId || null,
      componentProperties: s.componentProperties || null,
    }
    set({ sets: [...get().sets, newSet], nextSetId: id + 1, selectedSetId: id })
    get().autosave()
    return id
  },
  bulkAddSets: (newSets) => {
    get()._pushHistory()
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
      labelPosition: s.labelPosition || 'top-left',
      wallGap: s.wallGap || 0, opacity: s.opacity ?? 1, zIndex: s.zIndex ?? 0,
      iconType: s.iconType || 'rect', thickness: s.thickness ?? null,
      componentTypeId: s.componentTypeId || null,
      componentProperties: s.componentProperties || null,
    }))
    set({
      sets: [...get().sets, ...created],
      nextSetId: nextId + newSets.length,
    })
    get().autosave()
  },
  updateSet: (id, updates) => {
    get()._pushHistory()
    set({ sets: get().sets.map(s => s.id === id ? { ...s, ...updates } : s) })
    get().autosave()
  },
  deleteSet: (id) => {
    get()._pushHistory()
    set({
      sets: get().sets.filter(s => s.id !== id),
      rules: get().rules.filter(r => r.setA !== id && r.setB !== id),
      selectedSetId: get().selectedSetId === id ? null : get().selectedSetId,
    })
    get().autosave()
  },
  setSets: (sets) => {
    get()._pushHistory()
    set({ sets })
    get().autosave()
  },

  // Duplicate a set — auto-increments name with number suffix
  duplicateSet: (id) => {
    const state = get()
    const original = state.sets.find(s => s.id === id)
    if (!original) return
    get()._pushHistory()

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
    get()._pushHistory()
    set({
      sets: get().sets.map(s =>
        s.id === id ? { ...s, onPlan: false, lockedToPdf: false } : s
      ),
    })
    get().autosave()
  },

  // Add set back to the plan
  addSetToPlan: (id) => {
    get()._pushHistory()
    set({
      sets: get().sets.map(s =>
        s.id === id ? { ...s, onPlan: true, x: 100, y: 100 } : s
      ),
    })
    get().autosave()
  },

  // Hide set from plan but keep its position (for toggling visibility)
  hideSet: (id) => {
    get()._pushHistory()
    set({
      sets: get().sets.map(s =>
        s.id === id ? { ...s, hidden: true } : s
      ),
    })
    get().autosave()
  },

  // Show a hidden set (restore visibility at same position)
  showSet: (id) => {
    get()._pushHistory()
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
    get()._pushHistory()

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
    get()._pushHistory()
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
    get()._pushHistory()
    set({
      sets: get().sets.map(s =>
        s.id === id ? { ...s, cutouts: undefined } : s
      ),
    })
    get().autosave()
  },

  // Z-order control
  bringForward: (id) => {
    get()._pushHistory()
    const sets = get().sets
    const maxZ = Math.max(...sets.map(s => s.zIndex || 0))
    set({ sets: sets.map(s => s.id === id ? { ...s, zIndex: (s.zIndex || 0) + 1 } : s) })
    get().autosave()
  },
  sendBackward: (id) => {
    get()._pushHistory()
    set({ sets: get().sets.map(s => s.id === id ? { ...s, zIndex: Math.max(0, (s.zIndex || 0) - 1) } : s) })
    get().autosave()
  },
  bringToFront: (id) => {
    get()._pushHistory()
    const maxZ = Math.max(...get().sets.map(s => s.zIndex || 0))
    set({ sets: get().sets.map(s => s.id === id ? { ...s, zIndex: maxZ + 1 } : s) })
    get().autosave()
  },
  sendToBack: (id) => {
    get()._pushHistory()
    set({ sets: get().sets.map(s => s.id === id ? { ...s, zIndex: 0 } : s) })
    get().autosave()
  },

  // Lock/Unlock all on-plan sets to PDF
  lockAllToPdf: () => {
    get()._pushHistory()
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
    get()._pushHistory()
    const updatedSets = get().sets.map(s => {
      if (!s.lockedToPdf) return s
      const { pdfOffsetX, pdfOffsetY, ...rest } = s
      return { ...rest, lockedToPdf: false }
    })
    set({ sets: updatedSets })
    get().autosave()
  },

  // Dimension lines toggle
  setShowDimensions: (v) => {
    set({ showDimensions: v })
    get().autosave()
  },

  // Layer visibility by category
  setLayerVisibility: (category, visible) => {
    const current = get().layerVisibility
    set({ layerVisibility: { ...current, [category]: visible } })
    get().autosave()
  },
  toggleLayerVisibility: (category) => {
    const current = get().layerVisibility
    set({ layerVisibility: { ...current, [category]: !(current[category] ?? true) } })
    get().autosave()
  },

  // Annotation CRUD
  addAnnotation: (a) => {
    get()._pushHistory()
    const id = get().nextAnnotationId
    const newAnnotation = {
      ...a, id, x: a.x ?? 200, y: a.y ?? 200,
      text: a.text || 'Label', fontSize: a.fontSize || 14,
      color: a.color || '#ffffff', rotation: a.rotation || 0,
      bgColor: a.bgColor || null,
    }
    set({ annotations: [...get().annotations, newAnnotation], nextAnnotationId: id + 1 })
    get().autosave()
    return id
  },
  updateAnnotation: (id, updates) => {
    get()._pushHistory()
    set({ annotations: get().annotations.map(a => a.id === id ? { ...a, ...updates } : a) })
    get().autosave()
  },
  deleteAnnotation: (id) => {
    get()._pushHistory()
    set({ annotations: get().annotations.filter(a => a.id !== id) })
    get().autosave()
  },

  // Group CRUD
  addGroup: (name, setIds) => {
    get()._pushHistory()
    const id = get().nextGroupId
    const group = { id, name, setIds: [...setIds], collapsed: false }
    set({ groups: [...get().groups, group], nextGroupId: id + 1 })
    get().autosave()
    return id
  },
  updateGroup: (id, updates) => {
    set({ groups: get().groups.map(g => g.id === id ? { ...g, ...updates } : g) })
    get().autosave()
  },
  deleteGroup: (id) => {
    get()._pushHistory()
    set({ groups: get().groups.filter(g => g.id !== id) })
    get().autosave()
  },
  ungroupAll: (id) => {
    get()._pushHistory()
    set({ groups: get().groups.filter(g => g.id !== id) })
    get().autosave()
  },
  moveGroup: (groupId, dx, dy) => {
    get()._pushHistory()
    const group = get().groups.find(g => g.id === groupId)
    if (!group) return
    const updatedSets = get().sets.map(s =>
      group.setIds.includes(s.id) ? { ...s, x: s.x + dx, y: s.y + dy } : s
    )
    set({ sets: updatedSets })
    get().autosave()
  },

  // Clipboard
  copySet: (id) => {
    const s = get().sets.find(s => s.id === id)
    if (s) set({ _clipboard: JSON.parse(JSON.stringify(s)) })
  },
  pasteSet: () => {
    const clip = get()._clipboard
    if (!clip) return
    get()._pushHistory()
    const id = get().nextSetId
    const maxZ = get().sets.length > 0 ? Math.max(...get().sets.map(s => s.zIndex || 0)) : 0
    const newSet = {
      ...clip, id,
      name: clip.name + ' (copy)',
      x: clip.x + 40, y: clip.y + 40,
      lockedToPdf: false, zIndex: maxZ + 1,
      cutouts: clip.cutouts ? JSON.parse(JSON.stringify(clip.cutouts)) : undefined,
    }
    delete newSet.pdfOffsetX
    delete newSet.pdfOffsetY
    set({ sets: [...get().sets, newSet], nextSetId: id + 1, selectedSetId: id })
    get().autosave()
    return id
  },

  // Rule CRUD
  addRule: (r) => {
    get()._pushHistory()
    const id = get().nextRuleId
    set({ rules: [...get().rules, { ...r, id }], nextRuleId: id + 1 })
    get().autosave()
    return id
  },
  updateRule: (id, updates) => {
    get()._pushHistory()
    set({ rules: get().rules.map(r => r.id === id ? { ...r, ...updates } : r) })
    get().autosave()
  },
  deleteRule: (id) => {
    get()._pushHistory()
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
      labelMode: state.labelMode,
      showOverlaps: state.showOverlaps,
      viewMode: state.viewMode,
      showDimensions: state.showDimensions,
      layerVisibility: state.layerVisibility,
      sets: state.sets,
      nextSetId: state.nextSetId,
      rules: state.rules,
      nextRuleId: state.nextRuleId,
      annotations: state.annotations,
      nextAnnotationId: state.nextAnnotationId,
      groups: state.groups,
      nextGroupId: state.nextGroupId,
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
      labelMode: state.labelMode,
      showOverlaps: state.showOverlaps,
      viewMode: state.viewMode,
      showDimensions: state.showDimensions,
      layerVisibility: state.layerVisibility,
      sets: state.sets,
      nextSetId: state.nextSetId,
      rules: state.rules,
      nextRuleId: state.nextRuleId,
      annotations: state.annotations,
      nextAnnotationId: state.nextAnnotationId,
      groups: state.groups,
      nextGroupId: state.nextGroupId,
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
      labelMode: state.labelMode,
      showOverlaps: state.showOverlaps,
      viewMode: state.viewMode,
      showDimensions: state.showDimensions,
      layerVisibility: state.layerVisibility,
      sets: state.sets,
      nextSetId: state.nextSetId,
      rules: state.rules,
      nextRuleId: state.nextRuleId,
      annotations: state.annotations,
      nextAnnotationId: state.nextAnnotationId,
      groups: state.groups,
      nextGroupId: state.nextGroupId,
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
      labelMode: data.labelMode ?? 'inline',
      showOverlaps: data.showOverlaps ?? true,
      viewMode: data.viewMode ?? 'plan',
      showDimensions: data.showDimensions ?? false,
      layerVisibility: data.layerVisibility || {},
      sets: data.sets || [],
      nextSetId: data.nextSetId || 1,
      rules: data.rules || [],
      nextRuleId: data.nextRuleId || 1,
      annotations: data.annotations || [],
      nextAnnotationId: data.nextAnnotationId || 1,
      groups: data.groups || [],
      nextGroupId: data.nextGroupId || 1,
      selectedSetId: null,
      _past: [], _future: [],
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
      annotations: [],
      nextAnnotationId: 1,
      groups: [],
      nextGroupId: 1,
      layerVisibility: {},
      selectedSetId: null,
      _past: [], _future: [],
    })
    localStorage.removeItem(AUTOSAVE_KEY)
  },
}))

export default useStore
