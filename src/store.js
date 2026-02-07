import { create } from 'zustand'

const AUTOSAVE_KEY = 'floorplan-app-autosave'

function loadAutosave() {
  try {
    const data = localStorage.getItem(AUTOSAVE_KEY)
    if (data) return JSON.parse(data)
  } catch (e) { /* ignore */ }
  return null
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
  gridSize: saved?.gridSize || 50,

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
    set({ pdfPosition: pos })
    get().autosave()
  },
  setPixelsPerUnit: (p) => set({ pixelsPerUnit: p }),
  setUnit: (u) => set({ unit: u }),
  setGridVisible: (v) => set({ gridVisible: v }),
  setSnapToGrid: (v) => set({ snapToGrid: v }),
  setGridSize: (s) => set({ gridSize: s }),

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
    const newSet = { ...s, id, x: 100, y: 100, rotation: 0 }
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
    const data = {
      pdfImage: state.pdfImage,
      pdfRotation: state.pdfRotation,
      pdfPosition: state.pdfPosition,
      pixelsPerUnit: state.pixelsPerUnit,
      unit: state.unit,
      gridVisible: state.gridVisible,
      snapToGrid: state.snapToGrid,
      gridSize: state.gridSize,
      sets: state.sets,
      nextSetId: state.nextSetId,
      rules: state.rules,
      nextRuleId: state.nextRuleId,
    }
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data))
    } catch (e) { /* ignore quota errors */ }
  },

  exportProject: () => {
    const state = get()
    return {
      version: 1,
      pdfImage: state.pdfImage,
      pdfRotation: state.pdfRotation,
      pdfPosition: state.pdfPosition,
      pixelsPerUnit: state.pixelsPerUnit,
      unit: state.unit,
      gridVisible: state.gridVisible,
      snapToGrid: state.snapToGrid,
      gridSize: state.gridSize,
      sets: state.sets,
      nextSetId: state.nextSetId,
      rules: state.rules,
      nextRuleId: state.nextRuleId,
    }
  },

  importProject: (data) => {
    set({
      pdfImage: data.pdfImage || null,
      pdfRotation: data.pdfRotation || 0,
      pdfPosition: data.pdfPosition || { x: 0, y: 0 },
      pixelsPerUnit: data.pixelsPerUnit || 1,
      unit: data.unit || 'ft',
      gridVisible: data.gridVisible ?? true,
      snapToGrid: data.snapToGrid ?? true,
      gridSize: data.gridSize || 50,
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
