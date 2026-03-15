import { create } from 'zustand'

const AUTOSAVE_KEY = 'floorplan-app-autosave'
const SAVES_KEY = 'floorplan-app-saves'
const SERVER_PROJECT_KEY = 'floorplan-server-project-id'

// Debounced autosave — coalesces rapid changes into a single write
let _autosaveTimer = null
let _serverSaveTimer = null

// Build complete save data object from state — single source of truth for all save paths
function buildSaveData(state, extraFields = {}) {
  return {
    version: 1,
    projectName: state.projectName,
    lastSaved: new Date().toISOString(),
    pdfLayers: state.pdfLayers,
    nextPdfLayerId: state.nextPdfLayerId,
    activePdfLayerId: state.activePdfLayerId,
    pdfImage: state.pdfImage,
    pdfRotation: state.pdfRotation,
    pdfPosition: state.pdfPosition,
    pdfScale: state.pdfScale,
    pdfOriginalSize: state.pdfOriginalSize,
    pixelsPerUnit: state.pixelsPerUnit,
    unit: state.unit,
    gridVisible: state.gridVisible,
    snapToGrid: state.snapToGrid,
    snapToSets: state.snapToSets,
    gridSize: state.gridSize,
    labelsVisible: state.labelsVisible,
    labelMode: state.labelMode,
    labelFontSize: state.labelFontSize,
    labelColor: state.labelColor,
    showOverlaps: state.showOverlaps,
    viewMode: state.viewMode,
    wallRenderMode: state.wallRenderMode,
    showDimensions: state.showDimensions,
    dimMode: state.dimMode,
    showClearance: state.showClearance,
    crawlSpace: state.crawlSpace,
    exclusionZones: state.exclusionZones,
    nextExclusionZoneId: state.nextExclusionZoneId,
    showHoverTooltips: state.showHoverTooltips,
    showLockIndicators: state.showLockIndicators,
    defaultWallHeight: state.defaultWallHeight,
    layerVisibility: state.layerVisibility,
    sets: state.sets,
    nextSetId: state.nextSetId,
    rules: state.rules,
    nextRuleId: state.nextRuleId,
    annotations: state.annotations,
    nextAnnotationId: state.nextAnnotationId,
    groups: state.groups,
    nextGroupId: state.nextGroupId,
    buildingWalls: state.buildingWalls,
    nextBuildingWallId: state.nextBuildingWallId,
    buildingWallDefaults: state.buildingWallDefaults,
    buildingWallsVisible: state.buildingWallsVisible,
    buildingColumns: state.buildingColumns,
    nextBuildingColumnId: state.nextBuildingColumnId,
    buildingColumnsVisible: state.buildingColumnsVisible,
    ...extraFields,
  }
}

// Load persisted server project ID
function loadServerProjectId() {
  try { return parseInt(localStorage.getItem(SERVER_PROJECT_KEY)) || null }
  catch { return null }
}

function saveServerProjectId(id) {
  try {
    if (id) localStorage.setItem(SERVER_PROJECT_KEY, String(id))
    else localStorage.removeItem(SERVER_PROJECT_KEY)
  } catch { /* ignore */ }
}

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
  // PDF layers — each PDF is an independent layer with its own position/scale/visibility
  // Legacy single-PDF fields kept for backward compat on load, migrated to pdfLayers
  pdfLayers: saved?.pdfLayers || (saved?.pdfImage ? [{
    id: 1, name: 'Floor Plan', image: saved.pdfImage,
    rotation: saved.pdfRotation || 0, position: saved.pdfPosition || { x: 0, y: 0 },
    scale: saved.pdfScale || 1, originalSize: saved.pdfOriginalSize || null,
    visible: true, opacity: 0.6,
  }] : []),
  nextPdfLayerId: saved?.nextPdfLayerId || 2,
  activePdfLayerId: saved?.activePdfLayerId || (saved?.pdfImage ? 1 : null),

  // Legacy fields — kept for backward compat reads, but pdfLayers is the source of truth
  pdfImage: saved?.pdfImage || null,
  pdfRotation: saved?.pdfRotation || 0,
  pdfPosition: saved?.pdfPosition || { x: 0, y: 0 },
  pdfScale: saved?.pdfScale || 1,
  pdfOriginalSize: saved?.pdfOriginalSize || null,
  pixelsPerUnit: saved?.pixelsPerUnit || 1,
  unit: saved?.unit || 'ft',
  gridVisible: saved?.gridVisible ?? true,
  snapToGrid: saved?.snapToGrid ?? true,
  snapToSets: saved?.snapToSets ?? true,
  gridSize: saved?.gridSize || 50,
  labelsVisible: saved?.labelsVisible ?? true,
  labelMode: saved?.labelMode ?? 'inline',
  labelFontSize: saved?.labelFontSize ?? 0, // 0 = auto-scale
  labelColor: saved?.labelColor ?? '#ffffff',
  showOverlaps: saved?.showOverlaps ?? true,
  viewMode: saved?.viewMode ?? 'plan',
  wallRenderMode: saved?.wallRenderMode ?? 'finished', // 'finished', 'construction-front', 'construction-rear'

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

  // Building Walls (structural walls drawn on PDF)
  buildingWalls: saved?.buildingWalls || [],
  nextBuildingWallId: saved?.nextBuildingWallId || 1,
  buildingWallDefaults: saved?.buildingWallDefaults || { thickness: 1, height: 13, color: '#8B4513' },
  buildingWallsVisible: saved?.buildingWallsVisible ?? true,

  // Building Columns (structural columns locked to PDF)
  buildingColumns: saved?.buildingColumns || [],
  nextBuildingColumnId: saved?.nextBuildingColumnId || 1,
  buildingColumnsVisible: saved?.buildingColumnsVisible ?? true,

  // Multi-select (ephemeral, not persisted or undone)
  multiSelected: new Set(),

  // Drawing mode (transient, not persisted)
  drawingMode: null, // null | 'building-wall' | 'place-column' | 'place-component' | 'exclusion-zone'
  drawingWallPoints: [], // temporary points while drawing
  drawingWallSnap: true, // auto H/V snap while drawing
  // Column placement mode — stores the template for the next column to place
  columnPlacementTemplate: null, // { width, height, shape, color, label }
  selectedBuildingColumnId: null, // currently selected column on canvas

  // Layers visibility (by category)
  layerVisibility: saved?.layerVisibility || {},

  // Dimension lines
  showDimensions: saved?.showDimensions ?? false,
  dimMode: saved?.dimMode ?? 'selected', // 'selected' | 'all'

  // Clearance zone visibility
  showClearance: saved?.showClearance ?? false,

  // Exclusion zones (layout no-go areas)
  exclusionZones: saved?.exclusionZones ?? [],
  nextExclusionZoneId: saved?.nextExclusionZoneId || 1,

  // Crawl space — minimum gap between sets (in feet)
  crawlSpace: saved?.crawlSpace ?? 2, // 1.5 (18"), 2 (2'), 3 (3'), 0 (off)

  // Layout score (shown after auto-layout runs)
  layoutScore: null,

  // Hover tooltips
  showHoverTooltips: saved?.showHoverTooltips ?? true,

  // Lock indicators (amber dashed borders on locked sets)
  showLockIndicators: saved?.showLockIndicators ?? true,

  // Hide all sets (to see PDF clearly while drawing building walls)
  hideAllSets: false, // transient — not persisted

  // Default wall height (global setting, feet)
  defaultWallHeight: saved?.defaultWallHeight ?? 10,

  // Clipboard (not persisted)
  _clipboard: null,

  // UI state
  sidebarTab: 'sets',
  calibrating: false,
  pendingFitAll: false,
  calibrationPoints: [],
  selectedSetId: null,

  // PDF Layer actions
  addPdfLayer: (name, image, originalWidth, originalHeight) => {
    const id = get().nextPdfLayerId
    const layer = {
      id, name, image,
      rotation: 0, position: { x: 0, y: 0 },
      scale: 1, scaleX: 1, scaleY: 1,
      originalSize: { width: originalWidth, height: originalHeight },
      visible: true, opacity: 0.6,
      lockedToSetId: null,        // null = free, or set ID to pin to
      lockedToSetOffset: null,    // { dx, dy } relative to set's x,y
      zOrder: 'back',             // 'back' (behind sets) or 'front' (above sets)
    }
    // Only set as active (master) if no active layer exists yet
    // This prevents overlay PDFs from hijacking the master plan's lock behaviour
    const currentActive = get().activePdfLayerId
    const isFirstLayer = !currentActive
    const updates = {
      pdfLayers: [...get().pdfLayers, layer],
      nextPdfLayerId: id + 1,
    }
    if (isFirstLayer) {
      updates.activePdfLayerId = id
      updates.pdfImage = image
      updates.pdfRotation = 0
      updates.pdfPosition = { x: 0, y: 0 }
      updates.pdfScale = 1
      updates.pdfOriginalSize = { width: originalWidth, height: originalHeight }
    }
    set(updates)
    get().autosave()
    return id
  },

  removePdfLayer: (id) => {
    const layers = get().pdfLayers.filter(l => l.id !== id)
    const activeId = get().activePdfLayerId === id
      ? (layers.length > 0 ? layers[0].id : null)
      : get().activePdfLayerId
    const active = layers.find(l => l.id === activeId)
    set({
      pdfLayers: layers,
      activePdfLayerId: activeId,
      pdfImage: active?.image || null,
      pdfRotation: active?.rotation || 0,
      pdfPosition: active?.position || { x: 0, y: 0 },
      pdfScale: active?.scale || 1,
      pdfOriginalSize: active?.originalSize || null,
    })
    get().autosave()
  },

  setActivePdfLayer: (id) => {
    const layer = get().pdfLayers.find(l => l.id === id)
    if (!layer) return
    set({
      activePdfLayerId: id,
      pdfImage: layer.image,
      pdfRotation: layer.rotation,
      pdfPosition: layer.position,
      pdfScale: layer.scale,
      pdfOriginalSize: layer.originalSize,
    })
  },

  togglePdfLayerVisibility: (id) => {
    set({
      pdfLayers: get().pdfLayers.map(l =>
        l.id === id ? { ...l, visible: !l.visible } : l
      ),
    })
    get().autosave()
  },

  setPdfLayerOpacity: (id, opacity) => {
    set({
      pdfLayers: get().pdfLayers.map(l =>
        l.id === id ? { ...l, opacity } : l
      ),
    })
    get().autosave()
  },

  updatePdfLayer: (id, updates) => {
    set({
      pdfLayers: get().pdfLayers.map(l =>
        l.id === id ? { ...l, ...updates } : l
      ),
    })
    // Sync legacy fields if this is the active layer
    // Skip position/scale — those are handled by setPdfPosition/setPdfScale
    // which also move locked walls/sets (calling set() here would bypass that)
    if (get().activePdfLayerId === id) {
      const layer = get().pdfLayers.find(l => l.id === id)
      if (layer) {
        set({
          pdfImage: layer.image,
          pdfRotation: layer.rotation,
          pdfOriginalSize: layer.originalSize,
        })
      }
    }
    get().autosave()
  },

  renamePdfLayer: (id, name) => {
    set({
      pdfLayers: get().pdfLayers.map(l =>
        l.id === id ? { ...l, name } : l
      ),
    })
    get().autosave()
  },

  // Lock a PDF layer to a set (moves with the set)
  lockPdfToSet: (pdfLayerId, setId) => {
    const state = get()
    const layer = state.pdfLayers.find(l => l.id === pdfLayerId)
    const parentSet = state.sets.find(s => s.id === setId)
    if (!layer || !parentSet) return
    set({
      pdfLayers: state.pdfLayers.map(l =>
        l.id === pdfLayerId ? {
          ...l,
          lockedToSetId: setId,
          lockedToSetOffset: { dx: l.position.x - parentSet.x, dy: l.position.y - parentSet.y },
        } : l
      ),
    })
    get().autosave()
  },

  unlockPdfFromSet: (pdfLayerId) => {
    set({
      pdfLayers: get().pdfLayers.map(l =>
        l.id === pdfLayerId ? { ...l, lockedToSetId: null, lockedToSetOffset: null } : l
      ),
    })
    get().autosave()
  },

  setPdfLayerZOrder: (pdfLayerId, zOrder) => {
    set({
      pdfLayers: get().pdfLayers.map(l =>
        l.id === pdfLayerId ? { ...l, zOrder } : l
      ),
    })
    get().autosave()
  },

  // Legacy PDF actions (now sync to active layer)
  setPdfImage: (img) => set({ pdfImage: img }),
  setPdfRotation: (r) => {
    set({ pdfRotation: r })
    const activeId = get().activePdfLayerId
    if (activeId) {
      set({ pdfLayers: get().pdfLayers.map(l => l.id === activeId ? { ...l, rotation: r } : l) })
    }
    get().autosave()
  },
  setPdfScale: (s) => {
    set({ pdfScale: s })
    const activeId = get().activePdfLayerId
    if (activeId) {
      set({ pdfLayers: get().pdfLayers.map(l => l.id === activeId ? { ...l, scale: s } : l) })
    }
    get().autosave()
  },
  setPdfPosition: (pos) => {
    get()._pushHistory()
    const oldPos = get().pdfPosition
    const dx = pos.x - oldPos.x
    const dy = pos.y - oldPos.y
    // Move all locked-to-PDF sets with the PDF
    const updatedSets = get().sets.map(s =>
      s.lockedToPdf ? { ...s, x: s.x + dx, y: s.y + dy } : s
    )
    // Move all locked-to-PDF building walls with the PDF
    const updatedBW = get().buildingWalls.map(w =>
      w.lockedToPdf ? { ...w, x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy } : w
    )
    // Move all locked-to-PDF building columns with the PDF
    const updatedBC = get().buildingColumns.map(c =>
      c.lockedToPdf ? { ...c, x: c.x + dx, y: c.y + dy } : c
    )
    set({ pdfPosition: pos, sets: updatedSets, buildingWalls: updatedBW, buildingColumns: updatedBC })
    const activeId = get().activePdfLayerId
    // Also move PDF overlay layers that are pinned to any moved set
    const curLayers = get().pdfLayers
    const updatedLayers = curLayers.map(l => {
      if (!l.lockedToSetId) {
        // Not pinned to a set — only update master layer position
        return l.id === activeId ? { ...l, position: pos } : l
      }
      // Find the parent set (already moved in updatedSets)
      const parentSet = updatedSets.find(s => s.id === l.lockedToSetId)
      if (!parentSet) return l
      const off = l.lockedToSetOffset || { dx: 0, dy: 0 }
      return { ...l, position: { x: parentSet.x + off.dx, y: parentSet.y + off.dy } }
    })
    set({ pdfLayers: updatedLayers })
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
  setLabelFontSize: (size) => {
    set({ labelFontSize: size })
    get().autosave()
  },
  setLabelColor: (color) => {
    set({ labelColor: color })
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

  // Wall render mode (finished vs construction view)
  setWallRenderMode: (mode) => {
    set({ wallRenderMode: mode })
    get().autosave()
  },

  // Undo/redo
  _pushHistory: () => {
    const state = get()
    if (!state._recording) return
    const snapshot = {
      sets: structuredClone(state.sets),
      rules: structuredClone(state.rules),
      annotations: structuredClone(state.annotations),
      groups: structuredClone(state.groups),
      buildingWalls: structuredClone(state.buildingWalls),
      buildingColumns: structuredClone(state.buildingColumns),
      // PDF state — needed so undo restores PDF + overlay positions together
      pdfLayers: structuredClone(state.pdfLayers),
      pdfPosition: structuredClone(state.pdfPosition),
      pdfScale: state.pdfScale,
      pdfRotation: state.pdfRotation,
      nextSetId: state.nextSetId,
      nextRuleId: state.nextRuleId,
      nextAnnotationId: state.nextAnnotationId,
      nextGroupId: state.nextGroupId,
      nextBuildingWallId: state.nextBuildingWallId,
      nextBuildingColumnId: state.nextBuildingColumnId,
    }
    const past = [...state._past, snapshot]
    if (past.length > state._maxHistory) past.shift()
    set({ _past: past, _future: [] })
  },

  undo: () => {
    const state = get()
    const { _past, _future, sets, rules, annotations, groups, buildingWalls, buildingColumns, pdfLayers, pdfPosition, pdfScale, pdfRotation, nextSetId, nextRuleId, nextAnnotationId, nextGroupId, nextBuildingWallId, nextBuildingColumnId } = state
    if (_past.length === 0) return
    const currentSnapshot = {
      sets: structuredClone(sets),
      rules: structuredClone(rules),
      annotations: structuredClone(annotations),
      groups: structuredClone(groups),
      buildingWalls: structuredClone(buildingWalls),
      buildingColumns: structuredClone(buildingColumns),
      pdfLayers: structuredClone(pdfLayers),
      pdfPosition: structuredClone(pdfPosition),
      pdfScale, pdfRotation,
      nextSetId, nextRuleId, nextAnnotationId, nextGroupId, nextBuildingWallId, nextBuildingColumnId,
    }
    const previous = _past[_past.length - 1]
    const restoreUpdate = {
      _recording: false,
      sets: structuredClone(previous.sets),
      rules: structuredClone(previous.rules),
      annotations: structuredClone(previous.annotations || []),
      groups: structuredClone(previous.groups || []),
      buildingWalls: structuredClone(previous.buildingWalls || []),
      buildingColumns: structuredClone(previous.buildingColumns || []),
      nextSetId: previous.nextSetId,
      nextRuleId: previous.nextRuleId,
      nextAnnotationId: previous.nextAnnotationId || state.nextAnnotationId,
      nextGroupId: previous.nextGroupId || state.nextGroupId,
      nextBuildingWallId: previous.nextBuildingWallId || state.nextBuildingWallId,
      nextBuildingColumnId: previous.nextBuildingColumnId || state.nextBuildingColumnId,
      _past: _past.slice(0, -1),
      _future: [currentSnapshot, ..._future],
      selectedSetId: null,
      _recording: true,
    }
    // Restore PDF state if present in snapshot (backward compat with old snapshots)
    if (previous.pdfLayers) restoreUpdate.pdfLayers = structuredClone(previous.pdfLayers)
    if (previous.pdfPosition) restoreUpdate.pdfPosition = structuredClone(previous.pdfPosition)
    if (previous.pdfScale !== undefined) restoreUpdate.pdfScale = previous.pdfScale
    if (previous.pdfRotation !== undefined) restoreUpdate.pdfRotation = previous.pdfRotation
    set(restoreUpdate)
    get().autosave()
  },

  redo: () => {
    const state = get()
    const { _past, _future, sets, rules, annotations, groups, buildingWalls, buildingColumns, pdfLayers, pdfPosition, pdfScale, pdfRotation, nextSetId, nextRuleId, nextAnnotationId, nextGroupId, nextBuildingWallId, nextBuildingColumnId } = state
    if (_future.length === 0) return
    const currentSnapshot = {
      sets: structuredClone(sets),
      rules: structuredClone(rules),
      annotations: structuredClone(annotations),
      groups: structuredClone(groups),
      buildingWalls: structuredClone(buildingWalls),
      buildingColumns: structuredClone(buildingColumns),
      pdfLayers: structuredClone(pdfLayers),
      pdfPosition: structuredClone(pdfPosition),
      pdfScale, pdfRotation,
      nextSetId, nextRuleId, nextAnnotationId, nextGroupId, nextBuildingWallId, nextBuildingColumnId,
    }
    const next = _future[0]
    const restoreUpdate = {
      _recording: false,
      sets: structuredClone(next.sets),
      rules: structuredClone(next.rules),
      annotations: structuredClone(next.annotations || []),
      groups: structuredClone(next.groups || []),
      buildingWalls: structuredClone(next.buildingWalls || []),
      buildingColumns: structuredClone(next.buildingColumns || []),
      nextSetId: next.nextSetId,
      nextRuleId: next.nextRuleId,
      nextAnnotationId: next.nextAnnotationId || state.nextAnnotationId,
      nextGroupId: next.nextGroupId || state.nextGroupId,
      nextBuildingWallId: next.nextBuildingWallId || state.nextBuildingWallId,
      nextBuildingColumnId: next.nextBuildingColumnId || state.nextBuildingColumnId,
      _past: [..._past, currentSnapshot],
      _future: _future.slice(1),
      selectedSetId: null,
      _recording: true,
    }
    if (next.pdfLayers) restoreUpdate.pdfLayers = structuredClone(next.pdfLayers)
    if (next.pdfPosition) restoreUpdate.pdfPosition = structuredClone(next.pdfPosition)
    if (next.pdfScale !== undefined) restoreUpdate.pdfScale = next.pdfScale
    if (next.pdfRotation !== undefined) restoreUpdate.pdfRotation = next.pdfRotation
    set(restoreUpdate)
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
    // Stagger new set positions so they don't all stack at (100,100)
    const onPlanCount = get().sets.filter(s => s.onPlan !== false).length
    const defaultX = s.x ?? (100 + (onPlanCount % 5) * 150)
    const defaultY = s.y ?? (100 + Math.floor(onPlanCount / 5) * 150)
    const newSet = {
      ...s, id, x: defaultX, y: defaultY, rotation: 0, lockedToPdf: false, onPlan: true,
      category: s.category || 'Set', noCut: s.noCut ?? false, labelHidden: false,
      labelPosition: s.labelPosition || 'top-left',
      wallGap: s.wallGap || 0, opacity: s.opacity ?? 1, zIndex: s.zIndex ?? (maxZ + 1),
      iconType: s.iconType || 'rect', thickness: s.thickness ?? null,
      wallHeight: s.wallHeight ?? null, elevation: s.elevation ?? 0,
      materialTexture: s.materialTexture || null,
      gapSides: s.gapSides || null, // { top: true, right: true, bottom: true, left: true } or null for all sides
      removedWalls: s.removedWalls || null, // { top: false, right: false, bottom: false, left: false } or null
      hiddenWalls: s.hiddenWalls || null, // { top: false, right: false, bottom: false, left: false } or null
      wallExtensions: s.wallExtensions || null, // { top: 0, right: 0, bottom: 0, left: 0 } in feet or null
      componentTypeId: s.componentTypeId || null,
      componentProperties: s.componentProperties || null,
      lockedToSetId: s.lockedToSetId ?? null,
      lockedToSetOffset: s.lockedToSetOffset ?? null,
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
      wallHeight: s.wallHeight ?? null, elevation: s.elevation ?? 0,
      materialTexture: s.materialTexture || null,
      gapSides: s.gapSides || null,
      removedWalls: s.removedWalls || null,
      hiddenWalls: s.hiddenWalls || null,
      wallExtensions: s.wallExtensions || null,
      componentTypeId: s.componentTypeId || null,
      componentProperties: s.componentProperties || null,
      lockedToSetId: s.lockedToSetId ?? null,
      lockedToSetOffset: s.lockedToSetOffset ?? null,
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
    // Move any PDF layers locked to this set when position changes
    if (updates.x !== undefined || updates.y !== undefined) {
      const state = get()
      const updatedSet = state.sets.find(s => s.id === id)
      if (updatedSet) {
        const lockedPdfs = state.pdfLayers.filter(l => l.lockedToSetId === id)
        if (lockedPdfs.length > 0) {
          set({
            pdfLayers: state.pdfLayers.map(l => {
              if (l.lockedToSetId !== id) return l
              const off = l.lockedToSetOffset || { dx: 0, dy: 0 }
              return { ...l, position: { x: updatedSet.x + off.dx, y: updatedSet.y + off.dy } }
            }),
          })
        }
      }
    }
    get().autosave()
  },
  deleteSet: (id) => {
    get()._pushHistory()
    set({
      sets: get().sets
        .filter(s => s.id !== id)
        .map(s => s.lockedToSetId === id ? { ...s, lockedToSetId: null, lockedToSetOffset: null } : s),
      rules: get().rules.filter(r => r.setA !== id && r.setB !== id),
      selectedSetId: get().selectedSetId === id ? null : get().selectedSetId,
      // Unlock any PDF layers pinned to the deleted set
      pdfLayers: get().pdfLayers.map(l =>
        l.lockedToSetId === id ? { ...l, lockedToSetId: null, lockedToSetOffset: null } : l
      ),
    })
    get().autosave()
  },
  // Lock a component to a parent set (moves with it)
  lockToSet: (componentId, parentSetId) => {
    get()._pushHistory()
    const state = get()
    const component = state.sets.find(s => s.id === componentId)
    const parent = state.sets.find(s => s.id === parentSetId)
    if (!component || !parent) return
    // Prevent circular locking
    if (parent.lockedToSetId === componentId) return
    set({
      sets: state.sets.map(s =>
        s.id === componentId
          ? { ...s, lockedToSetId: parentSetId, lockedToSetOffset: { dx: s.x - parent.x, dy: s.y - parent.y }, lockedToPdf: false }
          : s
      ),
    })
    get().autosave()
  },

  // Unlock a component from its parent set
  unlockFromSet: (componentId) => {
    get()._pushHistory()
    set({
      sets: get().sets.map(s =>
        s.id === componentId
          ? { ...s, lockedToSetId: null, lockedToSetOffset: null }
          : s
      ),
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
      sets: get().sets.map(s => {
        if (s.id === id) return { ...s, onPlan: false, lockedToPdf: false }
        if (s.lockedToSetId === id) return { ...s, lockedToSetId: null, lockedToSetOffset: null }
        return s
      }),
    })
    get().autosave()
  },

  // Add set back to the plan
  addSetToPlan: (id) => {
    get()._pushHistory()
    const onPlanCount = get().sets.filter(s => s.onPlan !== false).length
    set({
      sets: get().sets.map(s =>
        s.id === id ? { ...s, onPlan: true, x: 100 + (onPlanCount % 5) * 150, y: 100 + Math.floor(onPlanCount / 5) * 150 } : s
      ),
    })
    get().autosave()
  },

  // Hide set from plan but keep its position (for toggling visibility)
  hideSet: (id) => {
    get()._pushHistory()
    set({
      sets: get().sets.map(s => {
        if (s.id === id) return { ...s, hidden: true }
        if (s.lockedToSetId === id) return { ...s, hidden: true }
        return s
      }),
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
  setDimMode: (v) => {
    set({ dimMode: v })
    get().autosave()
  },

  // Clearance zone toggle
  setShowClearance: (v) => {
    set({ showClearance: v })
    get().autosave()
  },

  // Crawl space
  setCrawlSpace: (v) => { set({ crawlSpace: v }); get().autosave() },

  // Layout score
  setLayoutScore: (v) => set({ layoutScore: v }),

  // Exclusion zones
  addExclusionZone: (zone) => {
    const id = get().nextExclusionZoneId
    set({
      exclusionZones: [...get().exclusionZones, { ...zone, id }],
      nextExclusionZoneId: id + 1,
    })
    get().autosave()
  },
  updateExclusionZone: (id, updates) => {
    set({
      exclusionZones: get().exclusionZones.map(z => z.id === id ? { ...z, ...updates } : z),
    })
    get().autosave()
  },
  deleteExclusionZone: (id) => {
    set({
      exclusionZones: get().exclusionZones.filter(z => z.id !== id),
    })
    get().autosave()
  },

  // Hover tooltips toggle
  setShowHoverTooltips: (v) => {
    set({ showHoverTooltips: v })
    get().autosave()
  },

  // Hide all sets toggle
  setHideAllSets: (v) => set({ hideAllSets: v }),

  // Lock indicators toggle
  setShowLockIndicators: (v) => {
    set({ showLockIndicators: v })
    get().autosave()
  },

  // Default wall height
  setDefaultWallHeight: (h) => {
    set({ defaultWallHeight: h })
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

  // Building Wall CRUD
  addBuildingWall: (wall) => {
    get()._pushHistory()
    const id = get().nextBuildingWallId
    const defaults = get().buildingWallDefaults
    const pdfPos = get().pdfPosition
    const newWall = {
      id,
      x1: wall.x1, y1: wall.y1,
      x2: wall.x2, y2: wall.y2,
      thickness: wall.thickness ?? defaults.thickness,
      height: wall.height ?? defaults.height ?? get().defaultWallHeight,
      color: wall.color ?? defaults.color,
      label: wall.label || '',
      lockedToPdf: true,
      pdfOffsetX1: wall.x1 - pdfPos.x, pdfOffsetY1: wall.y1 - pdfPos.y,
      pdfOffsetX2: wall.x2 - pdfPos.x, pdfOffsetY2: wall.y2 - pdfPos.y,
    }
    set({ buildingWalls: [...get().buildingWalls, newWall], nextBuildingWallId: id + 1 })
    get().autosave()
    return id
  },
  updateBuildingWall: (id, updates) => {
    get()._pushHistory()
    set({ buildingWalls: get().buildingWalls.map(w => w.id === id ? { ...w, ...updates } : w) })
    get().autosave()
  },
  deleteBuildingWall: (id) => {
    get()._pushHistory()
    set({ buildingWalls: get().buildingWalls.filter(w => w.id !== id) })
    get().autosave()
  },
  clearBuildingWalls: () => {
    get()._pushHistory()
    set({ buildingWalls: [], nextBuildingWallId: 1 })
    get().autosave()
  },

  // Toggle lock on individual building wall
  toggleBuildingWallLock: (id) => {
    get()._pushHistory()
    const state = get()
    const pdfPos = state.pdfPosition
    const updatedWalls = state.buildingWalls.map(w => {
      if (w.id !== id) return w
      if (w.lockedToPdf) {
        // Unlocking — remove offset data, keep absolute position
        const { pdfOffsetX1, pdfOffsetY1, pdfOffsetX2, pdfOffsetY2, ...rest } = w
        return { ...rest, lockedToPdf: false }
      } else {
        // Locking — store offsets from PDF origin
        return {
          ...w,
          lockedToPdf: true,
          pdfOffsetX1: w.x1 - pdfPos.x, pdfOffsetY1: w.y1 - pdfPos.y,
          pdfOffsetX2: w.x2 - pdfPos.x, pdfOffsetY2: w.y2 - pdfPos.y,
        }
      }
    })
    set({ buildingWalls: updatedWalls })
    get().autosave()
  },

  // Rotate a building wall around its midpoint by a given angle in degrees
  rotateBuildingWall: (id, angleDeg) => {
    get()._pushHistory()
    const state = get()
    const pdfPos = state.pdfPosition
    const updatedWalls = state.buildingWalls.map(w => {
      if (w.id !== id) return w
      const cx = (w.x1 + w.x2) / 2
      const cy = (w.y1 + w.y2) / 2
      const rad = angleDeg * Math.PI / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      // Rotate endpoints around midpoint
      const dx1 = w.x1 - cx, dy1 = w.y1 - cy
      const dx2 = w.x2 - cx, dy2 = w.y2 - cy
      const nx1 = cx + dx1 * cos - dy1 * sin
      const ny1 = cy + dx1 * sin + dy1 * cos
      const nx2 = cx + dx2 * cos - dy2 * sin
      const ny2 = cy + dx2 * sin + dy2 * cos
      const updated = { ...w, x1: nx1, y1: ny1, x2: nx2, y2: ny2 }
      // Update PDF offsets if locked
      if (w.lockedToPdf) {
        updated.pdfOffsetX1 = nx1 - pdfPos.x
        updated.pdfOffsetY1 = ny1 - pdfPos.y
        updated.pdfOffsetX2 = nx2 - pdfPos.x
        updated.pdfOffsetY2 = ny2 - pdfPos.y
      }
      return updated
    })
    set({ buildingWalls: updatedWalls })
    get().autosave()
  },

  // Building Column CRUD (structural columns locked to PDF)
  addBuildingColumn: (col) => {
    get()._pushHistory()
    const id = get().nextBuildingColumnId
    const pdfPos = get().pdfPosition
    const newCol = {
      id,
      x: col.x, y: col.y,
      width: col.width || 1,   // feet
      height: col.height || 1, // feet
      shape: col.shape || 'square', // 'round' or 'square'
      color: col.color || '#8B5CF6',
      label: col.label || '',
      lockedToPdf: true,
      pdfOffsetX: col.x - pdfPos.x,
      pdfOffsetY: col.y - pdfPos.y,
    }
    set({ buildingColumns: [...get().buildingColumns, newCol], nextBuildingColumnId: id + 1 })
    get().autosave()
    return id
  },
  updateBuildingColumn: (id, updates) => {
    get()._pushHistory()
    set({ buildingColumns: get().buildingColumns.map(c => c.id === id ? { ...c, ...updates } : c) })
    get().autosave()
  },
  deleteBuildingColumn: (id) => {
    get()._pushHistory()
    set({ buildingColumns: get().buildingColumns.filter(c => c.id !== id) })
    get().autosave()
  },
  clearBuildingColumns: () => {
    get()._pushHistory()
    set({ buildingColumns: [], nextBuildingColumnId: 1 })
    get().autosave()
  },
  toggleBuildingColumnLock: (id) => {
    get()._pushHistory()
    const state = get()
    const pdfPos = state.pdfPosition
    const updatedCols = state.buildingColumns.map(c => {
      if (c.id !== id) return c
      if (c.lockedToPdf) {
        const { pdfOffsetX, pdfOffsetY, ...rest } = c
        return { ...rest, lockedToPdf: false }
      } else {
        return {
          ...c,
          lockedToPdf: true,
          pdfOffsetX: c.x - pdfPos.x,
          pdfOffsetY: c.y - pdfPos.y,
        }
      }
    })
    set({ buildingColumns: updatedCols })
    get().autosave()
  },

  // Drawing mode
  setDrawingMode: (mode) => set({ drawingMode: mode, drawingWallPoints: [], columnPlacementTemplate: null, componentPlacementTemplate: null }),
  cancelDrawing: () => set({ drawingMode: null, drawingWallPoints: [], columnPlacementTemplate: null, componentPlacementTemplate: null }),

  // Column placement mode
  startColumnPlacement: (template) => set({
    drawingMode: 'place-column',
    columnPlacementTemplate: template,
    drawingWallPoints: [],
  }),

  // Generic component placement mode (windows, doors, walls, furniture, etc.)
  startComponentPlacement: (template) => set({
    drawingMode: 'place-component',
    componentPlacementTemplate: template,
    drawingWallPoints: [],
  }),
  setSelectedBuildingColumnId: (id) => set({ selectedBuildingColumnId: id }),

  // Duplicate a building column (offset by a small amount)
  duplicateBuildingColumn: (id) => {
    const state = get()
    const col = state.buildingColumns.find(c => c.id === id)
    if (!col) return
    const ppu = state.pixelsPerUnit || 50
    const offset = ppu * 2 // offset by 2 feet
    const newId = get().addBuildingColumn({
      x: col.x + offset,
      y: col.y + offset,
      width: col.width,
      height: col.height,
      shape: col.shape,
      color: col.color,
      label: col.label,
    })
    set({ selectedBuildingColumnId: newId })
  },
  breakDrawingChain: () => set({ drawingWallPoints: [] }), // break chain but stay in drawing mode
  setDrawingWallSnap: (v) => set({ drawingWallSnap: v }),
  addDrawingPoint: (pt) => {
    const state = get()
    const points = [...state.drawingWallPoints, pt]

    if (points.length >= 2) {
      // Create a wall segment from the two most recent points
      const prev = points[points.length - 2]
      const curr = points[points.length - 1]
      state._pushHistory()
      const id = state.nextBuildingWallId
      const defaults = state.buildingWallDefaults
      const pdfPos = state.pdfPosition
      const wall = {
        id,
        x1: prev.x, y1: prev.y,
        x2: curr.x, y2: curr.y,
        thickness: defaults.thickness,
        height: defaults.height ?? state.defaultWallHeight,
        color: defaults.color,
        label: '',
        lockedToPdf: true,
        pdfOffsetX1: prev.x - pdfPos.x, pdfOffsetY1: prev.y - pdfPos.y,
        pdfOffsetX2: curr.x - pdfPos.x, pdfOffsetY2: curr.y - pdfPos.y,
      }
      set({
        buildingWalls: [...state.buildingWalls, wall],
        nextBuildingWallId: id + 1,
        drawingWallPoints: [curr], // keep last point as start of next segment (chain)
      })
      state.autosave()
    } else {
      set({ drawingWallPoints: points })
    }
  },

  // Building wall defaults
  setBuildingWallDefaults: (updates) => {
    set({ buildingWallDefaults: { ...get().buildingWallDefaults, ...updates } })
    get().autosave()
  },
  setBuildingWallsVisible: (v) => {
    set({ buildingWallsVisible: v })
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
    const movedIds = new Set(group.setIds)
    const updatedSets = get().sets.map(s => {
      if (movedIds.has(s.id)) return { ...s, x: s.x + dx, y: s.y + dy }
      // Also move children locked to any moved parent
      if (s.lockedToSetId && movedIds.has(s.lockedToSetId)) return { ...s, x: s.x + dx, y: s.y + dy }
      return s
    })
    set({ sets: updatedSets })
    get().autosave()
  },

  // Multi-select actions
  setMultiSelected: (ids) => set({ multiSelected: ids instanceof Set ? ids : new Set(ids) }),
  toggleMultiSelect: (id) => {
    const current = new Set(get().multiSelected)
    if (current.has(id)) current.delete(id)
    else current.add(id)
    set({ multiSelected: current })
  },
  clearMultiSelect: () => set({ multiSelected: new Set() }),

  // Batch movement (sets + locked children + pinned PDFs)
  moveMultiple: (ids, dx, dy) => {
    const idSet = ids instanceof Set ? ids : new Set(ids)
    const updatedSets = get().sets.map(s => {
      if (idSet.has(s.id)) return { ...s, x: s.x + dx, y: s.y + dy }
      if (s.lockedToSetId && idSet.has(s.lockedToSetId)) return { ...s, x: s.x + dx, y: s.y + dy }
      return s
    })
    const updatedPdfs = get().pdfLayers.map(l => {
      if (l.lockedToSetId && idSet.has(l.lockedToSetId)) {
        const parent = updatedSets.find(s => s.id === l.lockedToSetId)
        if (parent && l.lockedToSetOffset) {
          return { ...l, position: { x: parent.x + l.lockedToSetOffset.dx, y: parent.y + l.lockedToSetOffset.dy } }
        }
      }
      return l
    })
    set({ sets: updatedSets, pdfLayers: updatedPdfs })
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
    // Debounce: coalesce rapid changes into a single localStorage write
    if (_autosaveTimer) clearTimeout(_autosaveTimer)
    _autosaveTimer = setTimeout(() => {
      _autosaveTimer = null
      const state = get()

      // SAFETY: Never overwrite autosave with empty/default state
      // This prevents hot-reload from wiping real work
      if (!state.pdfImage && state.pdfLayers.length === 0 && state.sets.length === 0 &&
          state.buildingWalls.length === 0 && state.buildingColumns.length === 0 &&
          state.annotations.length === 0) {
        return // nothing to save — don't wipe existing autosave
      }

      // Rotate backups: keep previous 2 autosaves
      try {
        const prev = localStorage.getItem(AUTOSAVE_KEY)
        if (prev) {
          const backup1 = localStorage.getItem(AUTOSAVE_KEY + '-backup-1')
          if (backup1) localStorage.setItem(AUTOSAVE_KEY + '-backup-2', backup1)
          localStorage.setItem(AUTOSAVE_KEY + '-backup-1', prev)
        }
      } catch (e) { /* ignore quota errors on backups */ }

      const now = new Date().toISOString()
      set({ lastSaved: now })
      const data = buildSaveData(state, { lastSaved: now })
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data))
      } catch (e) { /* ignore quota errors */ }

      // Periodic server autosave — every 2 minutes if linked to a server project
      const srvId = loadServerProjectId()
      if (srvId && !_serverSaveTimer) {
        _serverSaveTimer = setTimeout(() => {
          _serverSaveTimer = null
          get().saveToServer(srvId).catch(() => {})
        }, 120000) // 2 minutes
      }
    }, 500)
  },

  // Save to server by project ID (called by autosave and UI)
  saveToServer: async (projectId) => {
    const state = get()
    const data = buildSaveData(state)
    const token = localStorage.getItem('floorplan-token')
    if (!token) return
    const method = projectId ? 'PUT' : 'POST'
    const url = projectId ? `/api/projects/${projectId}` : '/api/projects'
    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: state.projectName, data }),
    })
    if (!resp.ok) throw new Error('Server save failed: ' + resp.status)
    const result = await resp.json()
    if (!projectId && result.id) {
      saveServerProjectId(result.id)
    }
    return result
  },

  // Get/set the linked server project ID
  getServerProjectId: () => loadServerProjectId(),
  setServerProjectId: (id) => saveServerProjectId(id),

  // Named project saves (stored in localStorage)
  saveProjectAs: (name) => {
    set({ projectName: name })
    const state = get()
    const data = buildSaveData(state, { projectName: name })
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
    return buildSaveData(get())
  },

  importProject: (data) => {
    // Migrate legacy single-PDF to pdfLayers if needed
    const pdfLayers = data.pdfLayers || (data.pdfImage ? [{
      id: 1, name: 'Floor Plan', image: data.pdfImage,
      rotation: data.pdfRotation || 0, position: data.pdfPosition || { x: 0, y: 0 },
      scale: data.pdfScale || 1, originalSize: data.pdfOriginalSize || null,
      visible: true, opacity: 0.6,
    }] : [])
    const activePdfLayerId = data.activePdfLayerId || (pdfLayers.length > 0 ? pdfLayers[0].id : null)
    const activeLayer = pdfLayers.find(l => l.id === activePdfLayerId)

    set({
      projectName: data.projectName || 'Untitled Project',
      pdfLayers,
      nextPdfLayerId: data.nextPdfLayerId || (pdfLayers.length > 0 ? Math.max(...pdfLayers.map(l => l.id)) + 1 : 1),
      activePdfLayerId,
      pdfImage: activeLayer?.image || data.pdfImage || null,
      pdfRotation: activeLayer?.rotation || data.pdfRotation || 0,
      pdfPosition: activeLayer?.position || data.pdfPosition || { x: 0, y: 0 },
      pdfScale: activeLayer?.scale || data.pdfScale || 1,
      pdfOriginalSize: activeLayer?.originalSize || data.pdfOriginalSize || null,
      pixelsPerUnit: data.pixelsPerUnit || 1,
      unit: data.unit || 'ft',
      gridVisible: data.gridVisible ?? true,
      snapToGrid: data.snapToGrid ?? true,
      snapToSets: data.snapToSets ?? true,
      gridSize: data.gridSize || 50,
      labelsVisible: data.labelsVisible ?? true,
      labelMode: data.labelMode ?? 'inline',
      labelFontSize: data.labelFontSize ?? 0,
      labelColor: data.labelColor ?? '#ffffff',
      showOverlaps: data.showOverlaps ?? true,
      viewMode: data.viewMode ?? 'plan',
      wallRenderMode: data.wallRenderMode ?? 'finished',
      showDimensions: data.showDimensions ?? false,
      dimMode: data.dimMode ?? 'selected',
      showClearance: data.showClearance ?? false,
      crawlSpace: data.crawlSpace ?? 2,
      exclusionZones: data.exclusionZones ?? [],
      nextExclusionZoneId: data.nextExclusionZoneId || 1,
      showHoverTooltips: data.showHoverTooltips ?? true,
      showLockIndicators: data.showLockIndicators ?? true,
      defaultWallHeight: data.defaultWallHeight ?? 10,
      layerVisibility: data.layerVisibility || {},
      sets: data.sets || [],
      nextSetId: data.nextSetId || 1,
      rules: data.rules || [],
      nextRuleId: data.nextRuleId || 1,
      annotations: data.annotations || [],
      nextAnnotationId: data.nextAnnotationId || 1,
      groups: data.groups || [],
      nextGroupId: data.nextGroupId || 1,
      buildingWalls: data.buildingWalls || [],
      nextBuildingWallId: data.nextBuildingWallId || 1,
      buildingWallDefaults: data.buildingWallDefaults || { thickness: 1, height: 13, color: '#8B4513' },
      buildingWallsVisible: data.buildingWallsVisible ?? true,
      buildingColumns: data.buildingColumns || [],
      nextBuildingColumnId: data.nextBuildingColumnId || 1,
      buildingColumnsVisible: data.buildingColumnsVisible ?? true,
      selectedSetId: null,
      _past: [], _future: [],
      pendingFitAll: true,
    })
    get().autosave()
  },

  // Import ONLY sets (and optionally building walls/columns) from another project,
  // keeping the current PDF, scale, and canvas state intact.
  importSetsOnly: (data, { includeBuildingWalls = true, includeBuildingColumns = true } = {}) => {
    const state = get()
    const incomingSets = data.sets || []
    const incomingWalls = data.buildingWalls || []
    const incomingCols = data.buildingColumns || []

    if (incomingSets.length === 0 && incomingWalls.length === 0 && incomingCols.length === 0) {
      return { setsAdded: 0, wallsAdded: 0, columnsAdded: 0 }
    }

    // Rescale: if source project had a different pixelsPerUnit, reposition objects
    const srcPPU = data.pixelsPerUnit || 1
    const dstPPU = state.pixelsPerUnit || 1
    const scaleFactor = dstPPU / srcPPU

    // Re-ID sets so they don't clash with existing
    let nextId = state.nextSetId
    const newSets = incomingSets.map(s => ({
      ...s,
      id: nextId++,
      x: (s.x || 0) * scaleFactor,
      y: (s.y || 0) * scaleFactor,
      lockedToPdf: false,
    }))

    // Re-ID building walls
    let nextBWId = state.nextBuildingWallId
    const newWalls = includeBuildingWalls ? incomingWalls.map(w => ({
      ...w,
      id: nextBWId++,
      x1: (w.x1 || 0) * scaleFactor,
      y1: (w.y1 || 0) * scaleFactor,
      x2: (w.x2 || 0) * scaleFactor,
      y2: (w.y2 || 0) * scaleFactor,
      lockedToPdf: false,
    })) : []

    // Re-ID building columns
    let nextBCId = state.nextBuildingColumnId
    const newCols = includeBuildingColumns ? incomingCols.map(c => ({
      ...c,
      id: nextBCId++,
      x: (c.x || 0) * scaleFactor,
      y: (c.y || 0) * scaleFactor,
      lockedToPdf: false,
    })) : []

    set({
      sets: [...state.sets, ...newSets],
      nextSetId: nextId,
      buildingWalls: [...state.buildingWalls, ...newWalls],
      nextBuildingWallId: nextBWId,
      buildingColumns: [...state.buildingColumns, ...newCols],
      nextBuildingColumnId: nextBCId,
    })
    get().autosave()

    return { setsAdded: newSets.length, wallsAdded: newWalls.length, columnsAdded: newCols.length }
  },

  clearAll: () => {
    set({
      projectName: 'Untitled Project',
      lastSaved: null,
      pdfLayers: [],
      nextPdfLayerId: 1,
      activePdfLayerId: null,
      pdfImage: null,
      pdfRotation: 0,
      pdfPosition: { x: 0, y: 0 },
      pdfScale: 1,
      pdfOriginalSize: null,
      pixelsPerUnit: 1,
      sets: [],
      nextSetId: 1,
      rules: [],
      nextRuleId: 1,
      annotations: [],
      nextAnnotationId: 1,
      groups: [],
      nextGroupId: 1,
      buildingWalls: [],
      nextBuildingWallId: 1,
      buildingWallDefaults: { thickness: 1, height: 13, color: '#8B4513' },
      buildingWallsVisible: true,
      buildingColumns: [],
      nextBuildingColumnId: 1,
      buildingColumnsVisible: true,
      drawingMode: null,
      drawingWallPoints: [],
      layerVisibility: {},
      selectedSetId: null,
      _past: [], _future: [],
    })
    localStorage.removeItem(AUTOSAVE_KEY)
  },

  // Restore from a backup autosave (backup-1 = most recent, backup-2 = older)
  restoreBackup: (level = 1) => {
    try {
      const backupKey = AUTOSAVE_KEY + '-backup-' + level
      const data = localStorage.getItem(backupKey)
      if (!data) {
        alert(`No backup-${level} found.`)
        return false
      }
      const parsed = JSON.parse(data)
      get().importProject(parsed)
      alert(`Restored from backup-${level} (saved: ${parsed.lastSaved || 'unknown'}).\n${parsed.sets?.length || 0} sets, ${parsed.buildingWalls?.length || 0} walls, ${parsed.buildingColumns?.length || 0} columns.`)
      return true
    } catch (e) {
      alert('Failed to restore backup: ' + e.message)
      return false
    }
  },

  // List available backups
  getBackupInfo: () => {
    const backups = []
    for (let i = 1; i <= 2; i++) {
      try {
        const data = localStorage.getItem(AUTOSAVE_KEY + '-backup-' + i)
        if (data) {
          const parsed = JSON.parse(data)
          backups.push({
            level: i,
            savedAt: parsed.lastSaved || 'unknown',
            sets: parsed.sets?.length || 0,
            walls: parsed.buildingWalls?.length || 0,
            columns: parsed.buildingColumns?.length || 0,
            projectName: parsed.projectName || 'Untitled',
          })
        }
      } catch (e) { /* ignore */ }
    }
    return backups
  },
}))

export default useStore
