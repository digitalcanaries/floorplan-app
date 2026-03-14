import { useState, useRef, useEffect, memo } from 'react'
import useStore from '../store.js'
import { getAABB } from '../engine/geometry.js'
import { toFeet, fromFeet, formatInUnit, UNITS, UNIT_OPTIONS } from '../engine/units.js'
import BulkImport from './BulkImport.jsx'

const COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
]

const CATEGORIES = ['Set', 'Wall', 'Window', 'Door', 'Furniture', 'Other']
const WALL_CATEGORIES = ['Wall', 'Window', 'Door']
const SET_CATEGORIES = ['Set', 'Furniture', 'Other']
const COMPONENT_CATEGORIES = ['Wall', 'Window', 'Door']
const GAP_PRESETS = [
  { label: 'None', value: 0, desc: 'No gap (back-to-back)' },
  { label: '1ft', value: 1, desc: 'Minimal clearance' },
  { label: '2ft', value: 2, desc: 'Power access' },
  { label: '4ft', value: 4, desc: 'Window/Door lighting' },
  { label: '6ft', value: 6, desc: 'Large lighting rig' },
]

const CATEGORY_COLORS = {
  Set: 'text-gray-400',
  Wall: 'text-amber-400',
  Window: 'text-cyan-400',
  Door: 'text-green-400',
  Furniture: 'text-purple-400',
  Other: 'text-gray-500',
}

export default memo(function SetsTab() {
  const {
    sets, addSet, updateSet, deleteSet, selectedSetId, setSelectedSetId, unit,
    pdfImage, toggleLockToPdf, lockAllToPdf, unlockAllFromPdf,
    duplicateSet, removeSetFromPlan, addSetToPlan, clearCutouts,
    hideSet, showSet, cutIntoSet,
    bringForward, sendBackward, bringToFront, sendToBack,
    labelMode,
    addGroup,
    startComponentPlacement, drawingMode, cancelDrawing,
    lockToSet, unlockFromSet,
  } = useStore()
  const { defaultWallHeight, setDefaultWallHeight } = useStore()
  const [form, setForm] = useState({
    name: '', width: '', height: '', color: COLORS[0],
    category: 'Set', wallGap: '', opacity: '1', noCut: false,
    wallHeight: '', gapSides: { top: true, right: true, bottom: true, left: true },
    removedWalls: { top: false, right: false, bottom: false, left: false },
    hiddenWalls: { top: false, right: false, bottom: false, left: false },
    wallExtensions: { top: '', right: '', bottom: '', left: '' },
    rotation: '0',
    placeCount: '1',
    placeSpacing: '',
    elevation: '',
  })
  const [editing, setEditing] = useState(null)
  const [cuttingSetId, setCuttingSetId] = useState(null)
  const [lockingComponentId, setLockingComponentId] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState(null)
  const [multiSelected, setMultiSelected] = useState(new Set())
  // Unit picker
  const [inputUnit, setInputUnit] = useState('ft')
  // Grouped sections
  const [setsCollapsed, setSetsCollapsed] = useState(false)
  const [componentsCollapsed, setComponentsCollapsed] = useState(false)
  // Quick search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [formCollapsed, setFormCollapsed] = useState(false)
  // Auto-scroll refs
  const rowRefs = useRef({})

  // When placement mode ends (Esc on canvas), reset the form
  const prevDrawingMode = useRef(drawingMode)
  useEffect(() => {
    if (prevDrawingMode.current === 'place-component' && drawingMode !== 'place-component' && !editing) {
      resetForm()
    }
    prevDrawingMode.current = drawingMode
  })

  // Helper: convert a form dimension value from inputUnit to feet
  const dimToFeet = (val) => toFeet(parseFloat(val), inputUnit)

  // Build the template object from current form state
  const buildTemplate = () => {
    const isWallType = WALL_CATEGORIES.includes(form.category)
    return {
      name: form.name,
      width: dimToFeet(form.width),
      height: dimToFeet(form.height),
      color: form.color,
      category: form.category,
      noCut: form.noCut || isWallType,
      wallGap: form.wallGap ? dimToFeet(form.wallGap) : 0,
      wallHeight: isWallType ? (form.wallHeight ? dimToFeet(form.wallHeight) : defaultWallHeight) : null,
      gapSides: isWallType && parseFloat(form.wallGap) > 0 ? form.gapSides : null,
      removedWalls: Object.values(form.removedWalls).some(v => v) ? form.removedWalls : null,
      hiddenWalls: Object.values(form.hiddenWalls).some(v => v) ? form.hiddenWalls : null,
      wallExtensions: Object.values(form.wallExtensions).some(v => parseFloat(v) > 0) ? { top: dimToFeet(form.wallExtensions.top) || 0, right: dimToFeet(form.wallExtensions.right) || 0, bottom: dimToFeet(form.wallExtensions.bottom) || 0, left: dimToFeet(form.wallExtensions.left) || 0 } : null,
      opacity: parseFloat(form.opacity) || 1,
      rotation: parseFloat(form.rotation) || 0,
      placeCount: isWallType ? Math.max(1, parseInt(form.placeCount) || 1) : 1,
      placeSpacing: isWallType && form.placeSpacing ? dimToFeet(form.placeSpacing) : 0,
      elevation: isWallType && form.elevation ? dimToFeet(form.elevation) : 0,
    }
  }

  const resetForm = () => {
    setForm({
      name: '', width: '', height: '', color: COLORS[(sets.length + 1) % COLORS.length],
      category: 'Set', wallGap: '', opacity: '1', noCut: false,
      wallHeight: '', gapSides: { top: true, right: true, bottom: true, left: true },
      removedWalls: { top: false, right: false, bottom: false, left: false },
      hiddenWalls: { top: false, right: false, bottom: false, left: false },
      wallExtensions: { top: '', right: '', bottom: '', left: '' },
      rotation: '0',
      placeCount: '1', placeSpacing: '', elevation: '',
    })
  }

  const handleAdd = (e) => {
    e.preventDefault()
    if (!form.name || !form.width || !form.height) return
    const isWallType = WALL_CATEGORIES.includes(form.category)
    const template = buildTemplate()

    if (isWallType) {
      // Enter click-to-place mode — user clicks canvas to place multiple copies
      startComponentPlacement(template)
    } else {
      // Sets add directly
      addSet(template)
      resetForm()
    }
  }

  const handleUpdate = (e) => {
    e.preventDefault()
    if (!form.name || !form.width || !form.height) return
    const template = buildTemplate()
    updateSet(editing, template)
    setEditing(null)
    resetForm()
  }

  const startEdit = (s) => {
    setEditing(s.id)
    setMultiSelected(new Set())
    setForm({
      name: s.name,
      width: String(formatInUnit(s.width, inputUnit)),
      height: String(formatInUnit(s.height, inputUnit)),
      color: s.color,
      category: s.category || 'Set',
      wallGap: s.wallGap ? String(formatInUnit(s.wallGap, inputUnit)) : '',
      opacity: String(s.opacity ?? 1),
      noCut: s.noCut || false,
      wallHeight: s.wallHeight ? String(formatInUnit(s.wallHeight, inputUnit)) : '',
      gapSides: s.gapSides || { top: true, right: true, bottom: true, left: true },
      removedWalls: s.removedWalls || { top: false, right: false, bottom: false, left: false },
      hiddenWalls: s.hiddenWalls || { top: false, right: false, bottom: false, left: false },
      wallExtensions: {
        top: s.wallExtensions?.top ? String(formatInUnit(s.wallExtensions.top, inputUnit)) : '',
        right: s.wallExtensions?.right ? String(formatInUnit(s.wallExtensions.right, inputUnit)) : '',
        bottom: s.wallExtensions?.bottom ? String(formatInUnit(s.wallExtensions.bottom, inputUnit)) : '',
        left: s.wallExtensions?.left ? String(formatInUnit(s.wallExtensions.left, inputUnit)) : '',
      },
      rotation: String(s.rotation || 0),
    })
  }

  const cancelEdit = () => {
    setEditing(null)
    resetForm()
  }

  const handleRotate = (e, setData) => {
    e.stopPropagation()
    const newRot = ((setData.rotation || 0) + 90) % 360
    updateSet(setData.id, { rotation: newRot })
  }

  const handleCutInto = (cutterSetId, targetSetId) => {
    cutIntoSet(cutterSetId, targetSetId)
    setCuttingSetId(null)
  }

  const handleCategoryChange = (cat) => {
    const isWallType = WALL_CATEGORIES.includes(cat)
    setForm(f => ({ ...f, category: cat, noCut: isWallType ? true : f.noCut }))
  }

  // Multi-select handlers
  const toggleMultiSelect = (e, id) => {
    e.stopPropagation()
    setMultiSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSetClick = (e, id) => {
    // Shift+click for multi-select
    if (e.shiftKey) {
      toggleMultiSelect(e, id)
      return
    }
    // Normal click — clear multi-select, toggle single selection
    if (multiSelected.size > 0) {
      setMultiSelected(new Set())
    }
    setSelectedSetId(id === selectedSetId ? null : id)
  }

  const selectAll = () => {
    setMultiSelected(new Set(filteredOnPlan.map(s => s.id)))
  }

  const clearMultiSelect = () => {
    setMultiSelected(new Set())
  }

  // Bulk actions
  const bulkSetCategory = (cat) => {
    const isWallType = WALL_CATEGORIES.includes(cat)
    for (const id of multiSelected) {
      updateSet(id, {
        category: cat,
        noCut: isWallType ? true : undefined,
      })
    }
  }

  const bulkSetColor = (color) => {
    for (const id of multiSelected) {
      updateSet(id, { color })
    }
  }

  const bulkSetNoCut = (val) => {
    for (const id of multiSelected) {
      updateSet(id, { noCut: val })
    }
  }

  const bulkHide = () => {
    for (const id of multiSelected) {
      hideSet(id)
    }
    setMultiSelected(new Set())
  }

  const bulkRemoveFromPlan = () => {
    for (const id of multiSelected) {
      removeSetFromPlan(id)
    }
    setMultiSelected(new Set())
  }

  const bulkDelete = () => {
    if (!confirm(`Delete ${multiSelected.size} selected items permanently?`)) return
    for (const id of multiSelected) {
      deleteSet(id)
    }
    setMultiSelected(new Set())
  }

  // Alignment functions
  const getSelectedSets = () => {
    const ppu = useStore.getState().pixelsPerUnit
    return [...multiSelected]
      .map(id => sets.find(s => s.id === id))
      .filter(Boolean)
      .map(s => ({ ...s, aabb: getAABB(s, ppu) }))
  }

  const alignLeft = () => {
    const selected = getSelectedSets()
    if (selected.length < 2) return
    const minX = Math.min(...selected.map(s => s.aabb.x))
    for (const s of selected) updateSet(s.id, { x: minX })
  }

  const alignRight = () => {
    const selected = getSelectedSets()
    if (selected.length < 2) return
    const maxRight = Math.max(...selected.map(s => s.aabb.x + s.aabb.w))
    for (const s of selected) updateSet(s.id, { x: maxRight - s.aabb.w })
  }

  const alignTop = () => {
    const selected = getSelectedSets()
    if (selected.length < 2) return
    const minY = Math.min(...selected.map(s => s.aabb.y))
    for (const s of selected) updateSet(s.id, { y: minY })
  }

  const alignBottom = () => {
    const selected = getSelectedSets()
    if (selected.length < 2) return
    const maxBottom = Math.max(...selected.map(s => s.aabb.y + s.aabb.h))
    for (const s of selected) updateSet(s.id, { y: maxBottom - s.aabb.h })
  }

  const alignCenterH = () => {
    const selected = getSelectedSets()
    if (selected.length < 2) return
    const allLeft = Math.min(...selected.map(s => s.aabb.x))
    const allRight = Math.max(...selected.map(s => s.aabb.x + s.aabb.w))
    const centerX = (allLeft + allRight) / 2
    for (const s of selected) updateSet(s.id, { x: centerX - s.aabb.w / 2 })
  }

  const alignCenterV = () => {
    const selected = getSelectedSets()
    if (selected.length < 2) return
    const allTop = Math.min(...selected.map(s => s.aabb.y))
    const allBottom = Math.max(...selected.map(s => s.aabb.y + s.aabb.h))
    const centerY = (allTop + allBottom) / 2
    for (const s of selected) updateSet(s.id, { y: centerY - s.aabb.h / 2 })
  }

  const distributeH = () => {
    const selected = getSelectedSets()
    if (selected.length < 3) return
    const sorted = [...selected].sort((a, b) => a.aabb.x - b.aabb.x)
    const totalWidth = sorted.reduce((sum, s) => sum + s.aabb.w, 0)
    const minX = sorted[0].aabb.x
    const maxRight = sorted[sorted.length - 1].aabb.x + sorted[sorted.length - 1].aabb.w
    const totalSpace = maxRight - minX - totalWidth
    const gap = totalSpace / (sorted.length - 1)
    let currentX = minX
    for (const s of sorted) {
      updateSet(s.id, { x: currentX })
      currentX += s.aabb.w + gap
    }
  }

  const distributeV = () => {
    const selected = getSelectedSets()
    if (selected.length < 3) return
    const sorted = [...selected].sort((a, b) => a.aabb.y - b.aabb.y)
    const totalHeight = sorted.reduce((sum, s) => sum + s.aabb.h, 0)
    const minY = sorted[0].aabb.y
    const maxBottom = sorted[sorted.length - 1].aabb.y + sorted[sorted.length - 1].aabb.h
    const totalSpace = maxBottom - minY - totalHeight
    const gap = totalSpace / (sorted.length - 1)
    let currentY = minY
    for (const s of sorted) {
      updateSet(s.id, { y: currentY })
      currentY += s.aabb.h + gap
    }
  }

  const onPlanSets = sets.filter(s => s.onPlan !== false && !s.hidden)
  const hiddenSets = sets.filter(s => s.onPlan !== false && s.hidden)
  const offPlanSets = sets.filter(s => s.onPlan === false)

  const filteredOnPlan = categoryFilter
    ? onPlanSets.filter(s => (s.category || 'Set') === categoryFilter)
    : onPlanSets
  const filteredSets = filteredOnPlan.filter(s => SET_CATEGORIES.includes(s.category || 'Set'))
  const filteredComponents = filteredOnPlan.filter(s => COMPONENT_CATEGORIES.includes(s.category))

  // Auto-scroll to selected set & expand its section
  useEffect(() => {
    if (!selectedSetId) return
    const s = sets.find(s => s.id === selectedSetId)
    if (!s) return
    if (COMPONENT_CATEGORIES.includes(s.category)) {
      setComponentsCollapsed(false)
    } else {
      setSetsCollapsed(false)
    }
    setTimeout(() => {
      rowRefs.current[selectedSetId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }, [selectedSetId])

  // Shared row renderer for both Sets and Components sections
  const renderSetRow = (s) => (
    <div key={s.id} ref={el => { rowRefs.current[s.id] = el }}>
      <div
        onClick={(e) => handleSetClick(e, s.id)}
        title={`${s.name} — ${WALL_CATEGORIES.includes(s.category) ? `W:${formatInUnit(s.width, inputUnit)} × H:${formatInUnit(s.wallHeight || defaultWallHeight, inputUnit)} × D:${formatInUnit(s.height, inputUnit)}${inputUnit}` : `${formatInUnit(s.width, inputUnit)}×${formatInUnit(s.height, inputUnit)}${inputUnit}`}${s.category && s.category !== 'Set' ? ` [${s.category}]` : ''}${s.wallGap > 0 ? ` Gap: ${formatInUnit(s.wallGap, inputUnit)}${inputUnit}` : ''}${s.lockedToPdf ? ' [Locked to PDF]' : ''}${s.lockedToSetId ? ` [Locked to ${sets.find(p => p.id === s.lockedToSetId)?.name || '?'}]` : ''}${s.noCut ? ' [No Cut]' : ''}${s.rotation ? ` ${s.rotation}\u00B0` : ''}`}
        className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer text-sm
          ${multiSelected.has(s.id) ? 'bg-indigo-900/40 border border-indigo-500/50' : s.id === selectedSetId ? 'bg-gray-600' : 'hover:bg-gray-700'}
          ${s.lockedToPdf && !multiSelected.has(s.id) ? 'border border-amber-600/40' : s.lockedToSetId && !multiSelected.has(s.id) ? 'border border-purple-600/40' : ''}`}
      >
        <input type="checkbox" checked={multiSelected.has(s.id)}
          onChange={(e) => toggleMultiSelect(e, s.id)} onClick={(e) => e.stopPropagation()}
          className="w-3 h-3 shrink-0 accent-indigo-500 cursor-pointer" />
        <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.color, opacity: s.opacity ?? 1 }} />
        <span className="flex-1 truncate text-xs">{s.name}</span>
        {(s.category && s.category !== 'Set') && (
          <span className={`text-[9px] ${CATEGORY_COLORS[s.category] || 'text-gray-500'}`}>{s.category}</span>
        )}
        {WALL_CATEGORIES.includes(s.category) ? (
          <span className="text-[10px] text-gray-400" title={`W:${formatInUnit(s.width, inputUnit)} × H:${formatInUnit(s.wallHeight || defaultWallHeight, inputUnit)} × D:${formatInUnit(s.height, inputUnit)}`}>
            {formatInUnit(s.width, inputUnit)}×{formatInUnit(s.wallHeight || defaultWallHeight, inputUnit)}×{formatInUnit(s.height, inputUnit)}
          </span>
        ) : (
          <span className="text-[10px] text-gray-400">{formatInUnit(s.width, inputUnit)}×{formatInUnit(s.height, inputUnit)}</span>
        )}
        {WALL_CATEGORIES.includes(s.category) && (
          <button onClick={(e) => {
            e.stopPropagation()
            const modes = [null, 'finished', 'construction-front']
            const idx = modes.indexOf(s.wallRenderMode || null)
            updateSet(s.id, { wallRenderMode: modes[(idx + 1) % modes.length] })
          }}
            className={`text-[9px] px-1 rounded ${
              s.wallRenderMode === 'finished' ? 'bg-emerald-700 text-emerald-200'
              : s.wallRenderMode === 'construction-front' ? 'bg-amber-700 text-amber-200'
              : 'text-gray-500 hover:text-gray-300'
            }`}
            title={`Render: ${s.wallRenderMode || 'Global'} — click to cycle`}>
            {s.wallRenderMode === 'finished' ? 'F' : s.wallRenderMode === 'construction-front' ? 'C' : 'G'}
          </button>
        )}
        {s.wallGap > 0 && (
          <span className="text-[9px] text-amber-500" title={`${formatInUnit(s.wallGap, inputUnit)}${inputUnit} access gap`}>
            {formatInUnit(s.wallGap, inputUnit)}{inputUnit}
          </span>
        )}
        {s.noCut && <span className="text-[10px] text-gray-500" title="No cut">&#x1F6E1;</span>}
        {s.cutouts?.length > 0 && (
          <button onClick={(e) => { e.stopPropagation(); clearCutouts(s.id) }}
            className="text-[10px] text-red-400 hover:text-yellow-300" title="Restore original shape">[cut] &#x21A9;</button>
        )}
        {!s.noCut && (
          <button onClick={(e) => { e.stopPropagation(); setCuttingSetId(cuttingSetId === s.id ? null : s.id) }}
            className={`text-xs ${cuttingSetId === s.id ? 'text-red-400' : 'text-gray-500 hover:text-red-300'}`}
            title="Cut this set into another set">&#x2702;</button>
        )}
        {pdfImage && (
          <button onClick={(e) => { e.stopPropagation(); toggleLockToPdf(s.id) }}
            className={`text-xs ${s.lockedToPdf ? 'text-amber-400' : 'text-gray-500 hover:text-amber-300'}`}
            title={s.lockedToPdf ? 'Unlock from PDF' : 'Lock to PDF position'}>
            {s.lockedToPdf ? '\u{1F4CC}' : '\u{1F4CD}'}
          </button>
        )}
        {/* Lock to Set button */}
        <button onClick={(e) => {
          e.stopPropagation()
          if (s.lockedToSetId) {
            unlockFromSet(s.id)
          } else {
            setLockingComponentId(lockingComponentId === s.id ? null : s.id)
          }
        }}
          className={`text-xs ${s.lockedToSetId ? 'text-purple-400' : 'text-gray-500 hover:text-purple-300'}`}
          title={s.lockedToSetId ? `Locked to ${sets.find(p => p.id === s.lockedToSetId)?.name || '?'} — click to unlock` : 'Lock to a set (moves with it)'}>
          {s.lockedToSetId ? '\u{1F517}' : '\u{1F50D}'}
        </button>
        <button onClick={(e) => { e.stopPropagation(); updateSet(s.id, { rotation: ((s.rotation || 0) - 1 + 360) % 360 }) }}
          className="text-[10px] text-yellow-400 hover:text-yellow-300" title="-1°">&#x25C1;</button>
        <span className="text-[9px] text-gray-500 min-w-[24px] text-center inline-block">{s.rotation || 0}°</span>
        <button onClick={(e) => { e.stopPropagation(); updateSet(s.id, { rotation: ((s.rotation || 0) + 1) % 360 }) }}
          className="text-[10px] text-yellow-400 hover:text-yellow-300" title="+1°">&#x25B7;</button>
        <button onClick={(e) => handleRotate(e, s)}
          className="text-[10px] text-yellow-400 hover:text-yellow-300" title="Rotate 90°">&#x21BB;</button>
        <button onClick={(e) => { e.stopPropagation(); updateSet(s.id, { flipX: !s.flipX }) }}
          className={`text-[10px] ${s.flipX ? 'text-cyan-400' : 'text-gray-500'} hover:text-cyan-300`} title="Flip horizontal">↔</button>
        <button onClick={(e) => { e.stopPropagation(); bringForward(s.id) }}
          className="text-[10px] text-gray-500 hover:text-white" title="Bring forward">&#x25B2;</button>
        <button onClick={(e) => { e.stopPropagation(); sendBackward(s.id) }}
          className="text-[10px] text-gray-500 hover:text-white" title="Send backward">&#x25BC;</button>
        <button onClick={(e) => { e.stopPropagation(); updateSet(s.id, { labelHidden: !s.labelHidden }) }}
          className={`text-[10px] ${s.labelHidden ? 'text-gray-600' : 'text-gray-400 hover:text-white'}`}
          title={s.labelHidden ? 'Show label' : 'Hide label'}>Aa</button>
        {!s.labelHidden && labelMode === 'inline' && (
          <select value={s.labelPosition || 'top-left'} onClick={e => e.stopPropagation()}
            onChange={e => { e.stopPropagation(); updateSet(s.id, { labelPosition: e.target.value }) }}
            className="text-[9px] bg-gray-700 border border-gray-600 rounded text-gray-400 px-0.5 py-0 w-8" title="Label position">
            <option value="top-left">TL</option><option value="top">T</option><option value="top-right">TR</option>
            <option value="left">L</option><option value="center">C</option><option value="right">R</option>
            <option value="bottom-left">BL</option><option value="bottom">B</option><option value="bottom-right">BR</option>
          </select>
        )}
        <button onClick={(e) => { e.stopPropagation(); duplicateSet(s.id) }}
          className="text-xs text-cyan-400 hover:text-cyan-300" title="Duplicate set">&#x29C9;</button>
        <button onClick={(e) => { e.stopPropagation(); hideSet(s.id) }}
          className="text-xs text-gray-500 hover:text-gray-300" title="Hide from plan">&#x1F441;</button>
        <button onClick={(e) => { e.stopPropagation(); removeSetFromPlan(s.id) }}
          className="text-xs text-orange-400 hover:text-orange-300" title="Remove from plan">&#x2B07;</button>
        <button onClick={(e) => { e.stopPropagation(); startEdit(s) }}
          className="text-xs text-blue-400 hover:text-blue-300" title="Edit set">&#x270E;</button>
        <button onClick={(e) => { e.stopPropagation(); deleteSet(s.id) }}
          className="text-xs text-red-400 hover:text-red-300" title="Delete permanently">&#x2715;</button>
      </div>
      {cuttingSetId === s.id && (
        <div className="ml-6 mt-1 mb-1 p-2 bg-gray-800 rounded border border-red-700/50">
          <p className="text-[10px] text-gray-400 mb-1">Cut <span className="text-white">{s.name}</span> into:</p>
          <div className="flex flex-col gap-0.5">
            {onPlanSets.filter(t => t.id !== s.id && !t.noCut).map(t => (
              <button key={t.id} onClick={() => handleCutInto(s.id, t.id)}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-left hover:bg-red-900/30 transition-colors">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.color }} />
                <span className="text-gray-300">{t.name}</span>
                <span className="text-[9px] text-gray-500">{formatInUnit(t.width, inputUnit)}x{formatInUnit(t.height, inputUnit)}</span>
              </button>
            ))}
            {onPlanSets.filter(t => t.id !== s.id && !t.noCut).length === 0 && (
              <p className="text-[10px] text-gray-500">No cuttable sets on plan</p>
            )}
          </div>
          <button onClick={() => setCuttingSetId(null)} className="mt-1 text-[10px] text-gray-500 hover:text-gray-300">Cancel</button>
        </div>
      )}
      {lockingComponentId === s.id && (
        <div className="ml-6 mt-1 mb-1 p-2 bg-gray-800 rounded border border-purple-700/50">
          <p className="text-[10px] text-gray-400 mb-1">Lock <span className="text-white">{s.name}</span> to:</p>
          <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
            {onPlanSets
              .filter(t => t.id !== s.id && !t.lockedToSetId && !COMPONENT_CATEGORIES.includes(t.category))
              .map(t => (
              <button key={t.id} onClick={() => { lockToSet(s.id, t.id); setLockingComponentId(null) }}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-left hover:bg-purple-900/30 transition-colors">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.color }} />
                <span className="text-gray-300">{t.name}</span>
                <span className="text-[9px] text-gray-500">{formatInUnit(t.width, inputUnit)}x{formatInUnit(t.height, inputUnit)}</span>
              </button>
            ))}
            {onPlanSets.filter(t => t.id !== s.id && !t.lockedToSetId && !COMPONENT_CATEGORIES.includes(t.category)).length === 0 && (
              <p className="text-[10px] text-gray-500">No lockable sets on plan</p>
            )}
          </div>
          <button onClick={() => setLockingComponentId(null)} className="mt-1 text-[10px] text-gray-500 hover:text-gray-300">Cancel</button>
        </div>
      )}
    </div>
  )

  return (
    <div className="p-3 flex flex-col gap-3">
      <BulkImport />

      {/* Collapsible form header */}
      <button onClick={() => setFormCollapsed(!formCollapsed)}
        className="flex items-center justify-between w-full px-2 py-1 bg-gray-700/50 rounded text-xs text-gray-300 hover:bg-gray-700">
        <span className="flex items-center gap-1.5">
          <span className="text-gray-500">{formCollapsed ? '\u25B8' : '\u25BE'}</span>
          <span className="font-medium">{editing ? `Edit ${form.category}` : `Add / Place`}</span>
        </span>
        {formCollapsed && <span className="text-[10px] text-gray-500">click to expand</span>}
      </button>

      {!formCollapsed && <>
      {/* Global default wall height */}
      <div className="flex items-center gap-2 px-1">
        <label className="text-[10px] text-gray-400 whitespace-nowrap">Default Wall Height:</label>
        <input
          type="number" value={formatInUnit(defaultWallHeight, inputUnit)} min="1" step="any"
          onChange={e => setDefaultWallHeight(toFeet(parseFloat(e.target.value) || 12, inputUnit))}
          className="px-1.5 py-0.5 bg-gray-700 border border-gray-600 rounded text-[10px] text-white w-14"
        />
        <span className="text-[10px] text-gray-500">{inputUnit}</span>
      </div>

      <div className="h-px bg-gray-700" />

      <form onSubmit={editing ? handleUpdate : handleAdd} className="flex flex-col gap-2">
        {/* Category selector — first so user picks type before filling details */}
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map(c => (
            <button key={c} type="button"
              onClick={() => handleCategoryChange(c)}
              className={`px-2 py-1 rounded text-xs ${
                form.category === c
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <input
          type="text" placeholder={`${form.category} name`} value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
        />
        <div className="flex gap-1 items-center">
          <input
            type="number" placeholder={`W (${inputUnit})`} value={form.width} min="0" step="any"
            onChange={e => setForm({ ...form, width: e.target.value })}
            className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white flex-1 min-w-0"
          />
          <span className="text-gray-500 text-xs">×</span>
          {WALL_CATEGORIES.includes(form.category) ? (
            <>
              <input
                type="number" placeholder={`H (${inputUnit})`} value={form.wallHeight} min="0" step="any"
                onChange={e => setForm({ ...form, wallHeight: e.target.value })}
                className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white flex-1 min-w-0"
              />
              <span className="text-gray-500 text-xs">×</span>
              <input
                type="number" placeholder={`D (${inputUnit})`} value={form.height} min="0" step="any"
                onChange={e => setForm({ ...form, height: e.target.value })}
                className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white flex-1 min-w-0"
                title="Depth — how far this projects from the wall on the floor plan"
              />
            </>
          ) : (
            <input
              type="number" placeholder={`H (${inputUnit})`} value={form.height} min="0" step="any"
              onChange={e => setForm({ ...form, height: e.target.value })}
              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white flex-1 min-w-0"
            />
          )}
          <select value={inputUnit} onChange={e => {
            const newU = e.target.value
            const oldU = inputUnit
            // Live-convert form values from old unit → feet → new unit
            const conv = (v) => v ? String(formatInUnit(toFeet(parseFloat(v), oldU), newU)) : ''
            setForm(f => ({
              ...f,
              width: conv(f.width), height: conv(f.height),
              wallGap: conv(f.wallGap), wallHeight: conv(f.wallHeight),
              placeSpacing: conv(f.placeSpacing), elevation: conv(f.elevation),
              wallExtensions: Object.fromEntries(Object.entries(f.wallExtensions).map(([k, v]) => [k, conv(v)])),
            }))
            setInputUnit(newU)
          }}
            className="px-1 py-1 bg-gray-600 border border-gray-500 rounded text-xs text-white w-12 shrink-0"
          >
            {UNIT_OPTIONS.map(u => <option key={u} value={u}>{UNITS[u].label}</option>)}
          </select>
        </div>

        {/* Wall gap — shown for Wall/Window/Door */}
        {WALL_CATEGORIES.includes(form.category) && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Access Gap ({inputUnit}):</label>
              <input
                type="number" placeholder="0" value={form.wallGap} min="0" step="any"
                onChange={e => setForm({ ...form, wallGap: e.target.value })}
                className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white w-16"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {GAP_PRESETS.map(p => {
                const displayVal = String(formatInUnit(p.value, inputUnit))
                return (
                  <button key={p.value} type="button"
                    onClick={() => setForm({ ...form, wallGap: displayVal })}
                    className={`px-1.5 py-0.5 rounded text-[10px] border ${
                      form.wallGap === displayVal ? 'bg-amber-700 border-amber-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'
                    }`}
                    title={p.desc}
                  >
                    {p.value === 0 ? p.label : `${displayVal}${inputUnit}`} <span className="text-gray-500">{p.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Wall height default hint — shown for Wall/Window/Door (height input is now in the W×H×D row) */}
        {WALL_CATEGORIES.includes(form.category) && !form.wallHeight && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">H defaults to {formatInUnit(defaultWallHeight, inputUnit)}{inputUnit} if left blank</span>
          </div>
        )}

        {/* Multi-placement — count, spacing, elevation — shown for Window/Door/Wall */}
        {WALL_CATEGORIES.includes(form.category) && !editing && (
          <div className="flex flex-col gap-1.5 p-2 bg-gray-800/50 rounded border border-gray-700">
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Multi-Placement</span>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-400 w-12">Count:</label>
              <input
                type="number" min="1" max="20" step="1"
                placeholder="1" value={form.placeCount}
                onChange={e => setForm({ ...form, placeCount: e.target.value })}
                className="px-1.5 py-0.5 bg-gray-700 border border-gray-600 rounded text-[10px] text-white w-14"
              />
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button"
                    onClick={() => setForm({ ...form, placeCount: String(n) })}
                    className={`w-5 h-5 rounded text-[10px] ${
                      String(form.placeCount) === String(n) ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-400 w-12">Spacing:</label>
              <input
                type="number" min="0" step="any"
                placeholder={`0 ${inputUnit}`} value={form.placeSpacing}
                onChange={e => setForm({ ...form, placeSpacing: e.target.value })}
                className="px-1.5 py-0.5 bg-gray-700 border border-gray-600 rounded text-[10px] text-white w-14"
              />
              <span className="text-[10px] text-gray-500">{inputUnit} between each</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-400 w-12">Elev:</label>
              <input
                type="number" min="0" step="any"
                placeholder={`0 ${inputUnit}`} value={form.elevation}
                onChange={e => setForm({ ...form, elevation: e.target.value })}
                className="px-1.5 py-0.5 bg-gray-700 border border-gray-600 rounded text-[10px] text-white w-14"
              />
              <span className="text-[10px] text-gray-500">{inputUnit} off ground</span>
            </div>
          </div>
        )}

        {/* Per-side gap control — shown when wallGap > 0 */}
        {WALL_CATEGORIES.includes(form.category) && parseFloat(form.wallGap) > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-gray-400">Gap sides:</label>
            <div className="flex gap-2">
              {['top', 'right', 'bottom', 'left'].map(side => (
                <label key={side} className="flex items-center gap-1 text-[10px] text-gray-300 cursor-pointer">
                  <input type="checkbox"
                    checked={form.gapSides[side]}
                    onChange={e => setForm({
                      ...form,
                      gapSides: { ...form.gapSides, [side]: e.target.checked }
                    })}
                    className="w-3 h-3 accent-amber-500"
                  />
                  {side.charAt(0).toUpperCase() + side.slice(1)}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Opacity slider */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Opacity:</label>
          <input
            type="range" min="0.1" max="1" step="0.1"
            value={form.opacity}
            onChange={e => setForm({ ...form, opacity: e.target.value })}
            className="flex-1 h-1 accent-indigo-500"
          />
          <span className="text-[10px] text-gray-400 w-6 text-right">{Math.round((form.opacity || 1) * 100)}%</span>
        </div>

        {/* Rotation — precision control with nudge buttons */}
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-400 mr-1">Rotation:</label>
          <button type="button" onClick={() => setForm({ ...form, rotation: String(((parseFloat(form.rotation) || 0) - 5 + 360) % 360) })}
            className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300 hover:bg-gray-600" title="-5°">-5</button>
          <button type="button" onClick={() => setForm({ ...form, rotation: String(((parseFloat(form.rotation) || 0) - 1 + 360) % 360) })}
            className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300 hover:bg-gray-600" title="-1°">-1</button>
          <input type="number" min="0" max="359" step="1"
            value={form.rotation}
            onChange={e => setForm({ ...form, rotation: e.target.value })}
            className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white w-16 text-center"
          />
          <span className="text-[10px] text-gray-400">°</span>
          <button type="button" onClick={() => setForm({ ...form, rotation: String(((parseFloat(form.rotation) || 0) + 1) % 360) })}
            className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300 hover:bg-gray-600" title="+1°">+1</button>
          <button type="button" onClick={() => setForm({ ...form, rotation: String(((parseFloat(form.rotation) || 0) + 5) % 360) })}
            className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300 hover:bg-gray-600" title="+5°">+5</button>
          <button type="button" onClick={() => setForm({ ...form, rotation: String(((parseFloat(form.rotation) || 0) + 90) % 360) })}
            className="px-1.5 py-0.5 bg-indigo-600 rounded text-[10px] text-white hover:bg-indigo-500" title="+90°">90</button>
        </div>

        {/* Flip controls */}
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-400 mr-1">Flip:</label>
          <button type="button"
            onClick={() => updateSet(s.id, { flipX: !s.flipX })}
            className={`px-2 py-0.5 rounded text-[10px] ${s.flipX ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            title="Flip horizontal">
            ↔ H
          </button>
          <button type="button"
            onClick={() => updateSet(s.id, { flipY: !s.flipY })}
            className={`px-2 py-0.5 rounded text-[10px] ${s.flipY ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            title="Flip vertical">
            ↕ V
          </button>
        </div>

        {/* Remove walls — available for all set types */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-400">Remove walls:</label>
          <div className="flex gap-2">
            {['top', 'right', 'bottom', 'left'].map(side => (
              <label key={side} className="flex items-center gap-1 text-[10px] text-gray-300 cursor-pointer">
                <input type="checkbox"
                  checked={form.removedWalls[side]}
                  onChange={e => setForm({
                    ...form,
                    removedWalls: { ...form.removedWalls, [side]: e.target.checked }
                  })}
                  className="w-3 h-3 accent-red-500"
                />
                {side.charAt(0).toUpperCase() + side.slice(1)}
              </label>
            ))}
          </div>
        </div>

        {/* Hide walls — invisible but structurally present */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-400">Hide walls (ghosted):</label>
          <div className="flex gap-2">
            {['top', 'right', 'bottom', 'left'].map(side => (
              <label key={side} className="flex items-center gap-1 text-[10px] text-gray-300 cursor-pointer">
                <input type="checkbox"
                  checked={form.hiddenWalls[side]}
                  onChange={e => setForm({
                    ...form,
                    hiddenWalls: { ...form.hiddenWalls, [side]: e.target.checked }
                  })}
                  className="w-3 h-3 accent-gray-500"
                />
                {side.charAt(0).toUpperCase() + side.slice(1)}
              </label>
            ))}
          </div>
        </div>

        {/* Wall extensions — extend walls beyond set boundary */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-400">Extend walls ({inputUnit}):</label>
          <div className="grid grid-cols-4 gap-1">
            {['top', 'right', 'bottom', 'left'].map(side => (
              <div key={side} className="flex flex-col items-center">
                <span className="text-[9px] text-gray-500">{side.charAt(0).toUpperCase() + side.slice(1)}</span>
                <input
                  type="number" min="0" step="any" placeholder="0"
                  value={form.wallExtensions[side]}
                  onChange={e => setForm({
                    ...form,
                    wallExtensions: { ...form.wallExtensions, [side]: e.target.value }
                  })}
                  className="w-full px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-[10px] text-white text-center"
                />
              </div>
            ))}
          </div>
        </div>

        {/* No-cut toggle */}
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={form.noCut}
            onChange={e => setForm({ ...form, noCut: e.target.checked })} />
          <span className="text-gray-400">No Cut (cannot be cut into or used as cutter)</span>
        </label>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Color:</label>
          <div className="flex gap-1 flex-wrap">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                className={`w-5 h-5 rounded-sm border-2 ${form.color === c ? 'border-white' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        {/* Placement mode indicator */}
        {drawingMode === 'place-component' && !editing && (
          <div className="flex items-center gap-2 px-2 py-1.5 bg-indigo-900/60 border border-indigo-500/50 rounded text-sm">
            <span className="text-indigo-200 animate-pulse">●</span>
            <span className="text-indigo-100 flex-1">
              {parseInt(form.placeCount) > 1 ? `Placing ${form.placeCount}× — ` : ''}Click canvas to place — Esc when done
            </span>
            <button type="button" onClick={() => { cancelDrawing(); resetForm() }}
              className="px-2 py-0.5 bg-gray-600 hover:bg-gray-500 rounded text-xs text-white">
              Done
            </button>
          </div>
        )}
        <div className="flex gap-2">
          {drawingMode === 'place-component' && !editing ? null : (
            <button type="submit"
              className="flex-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-sm text-white">
              {editing
                ? `Update ${form.category}`
                : WALL_CATEGORIES.includes(form.category)
                  ? `Place ${form.category}`
                  : `Add ${form.category}`}
            </button>
          )}
          {editing && (
            <button type="button" onClick={cancelEdit}
              className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm text-white">
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Lock all / Unlock all */}
      {pdfImage && onPlanSets.length > 0 && (
        <div className="flex gap-2">
          <button onClick={lockAllToPdf}
            className="flex-1 px-2 py-1 bg-amber-700 hover:bg-amber-600 rounded text-xs text-white">
            Lock All
          </button>
          <button onClick={unlockAllFromPdf}
            className="flex-1 px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs text-white">
            Unlock All
          </button>
        </div>
      )}
      </>}

      {/* Category filter tabs */}
      {onPlanSets.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`px-1.5 py-0.5 rounded text-[10px] ${!categoryFilter ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
          >
            All ({onPlanSets.length})
          </button>
          {CATEGORIES.filter(c => onPlanSets.some(s => (s.category || 'Set') === c)).map(c => (
            <button key={c}
              onClick={() => setCategoryFilter(categoryFilter === c ? null : c)}
              className={`px-1.5 py-0.5 rounded text-[10px] ${categoryFilter === c ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
            >
              {c} ({onPlanSets.filter(s => (s.category || 'Set') === c).length})
            </button>
          ))}
        </div>
      )}

      {/* Multi-select bulk actions bar */}
      {multiSelected.size > 0 && (
        <div className="bg-indigo-900/50 border border-indigo-600/50 rounded p-2 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-indigo-300 font-medium">{multiSelected.size} selected</span>
            <button onClick={selectAll} className="text-[10px] text-indigo-400 hover:text-white">Select All</button>
            <div className="flex-1" />
            <button onClick={clearMultiSelect} className="text-xs text-gray-400 hover:text-white">&#x2715;</button>
          </div>

          {/* Bulk category change */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-400">Change category:</span>
            <div className="flex gap-1 flex-wrap">
              {CATEGORIES.map(c => (
                <button key={c}
                  onClick={() => bulkSetCategory(c)}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-gray-700 text-gray-300 hover:bg-indigo-600 hover:text-white"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk color change */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400">Color:</span>
            <div className="flex gap-0.5 flex-wrap">
              {COLORS.map(c => (
                <button key={c}
                  onClick={() => bulkSetColor(c)}
                  className="w-4 h-4 rounded-sm border border-gray-600 hover:border-white"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Alignment tools */}
          {multiSelected.size >= 2 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-400">Align:</span>
              <div className="flex gap-1 flex-wrap">
                <button onClick={alignLeft} title="Align left edges"
                  className="px-1.5 py-1 rounded text-[10px] bg-gray-700 text-gray-300 hover:bg-cyan-700 hover:text-white font-mono">
                  &#x258C; L
                </button>
                <button onClick={alignCenterH} title="Align centers horizontally"
                  className="px-1.5 py-1 rounded text-[10px] bg-gray-700 text-gray-300 hover:bg-cyan-700 hover:text-white font-mono">
                  &#x2503; CH
                </button>
                <button onClick={alignRight} title="Align right edges"
                  className="px-1.5 py-1 rounded text-[10px] bg-gray-700 text-gray-300 hover:bg-cyan-700 hover:text-white font-mono">
                  &#x2590; R
                </button>
                <button onClick={alignTop} title="Align top edges"
                  className="px-1.5 py-1 rounded text-[10px] bg-gray-700 text-gray-300 hover:bg-cyan-700 hover:text-white font-mono">
                  &#x2580; T
                </button>
                <button onClick={alignCenterV} title="Align centers vertically"
                  className="px-1.5 py-1 rounded text-[10px] bg-gray-700 text-gray-300 hover:bg-cyan-700 hover:text-white font-mono">
                  &#x2501; CV
                </button>
                <button onClick={alignBottom} title="Align bottom edges"
                  className="px-1.5 py-1 rounded text-[10px] bg-gray-700 text-gray-300 hover:bg-cyan-700 hover:text-white font-mono">
                  &#x2584; B
                </button>
              </div>
              {multiSelected.size >= 3 && (
                <div className="flex gap-1">
                  <button onClick={distributeH} title="Distribute evenly horizontally"
                    className="px-1.5 py-1 rounded text-[10px] bg-gray-700 text-gray-300 hover:bg-cyan-700 hover:text-white">
                    &#x2194; Distribute H
                  </button>
                  <button onClick={distributeV} title="Distribute evenly vertically"
                    className="px-1.5 py-1 rounded text-[10px] bg-gray-700 text-gray-300 hover:bg-cyan-700 hover:text-white">
                    &#x2195; Distribute V
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Bulk label position */}
          {labelMode === 'inline' && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400">Label pos:</span>
              <select defaultValue=""
                onChange={e => {
                  if (e.target.value) {
                    for (const id of multiSelected) updateSet(id, { labelPosition: e.target.value })
                    e.target.value = ''
                  }
                }}
                className="text-[10px] bg-gray-700 border border-gray-600 rounded text-gray-300 px-1 py-0.5">
                <option value="" disabled>Choose...</option>
                <option value="top-left">Top Left</option>
                <option value="top">Top</option>
                <option value="top-right">Top Right</option>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom">Bottom</option>
                <option value="bottom-right">Bottom Right</option>
              </select>
            </div>
          )}

          {/* Bulk actions row */}
          <div className="flex gap-1 flex-wrap">
            <button onClick={() => {
              const name = prompt('Group name:', `Group ${Date.now() % 1000}`)
              if (name && name.trim()) {
                addGroup(name.trim(), [...multiSelected])
                setMultiSelected(new Set())
              }
            }}
              className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-700 text-white hover:bg-indigo-600">
              Group
            </button>
            <button onClick={() => bulkSetNoCut(true)}
              className="px-1.5 py-0.5 rounded text-[10px] bg-gray-700 text-gray-300 hover:bg-gray-600">
              No Cut On
            </button>
            <button onClick={() => bulkSetNoCut(false)}
              className="px-1.5 py-0.5 rounded text-[10px] bg-gray-700 text-gray-300 hover:bg-gray-600">
              No Cut Off
            </button>
            <button onClick={bulkHide}
              className="px-1.5 py-0.5 rounded text-[10px] bg-gray-700 text-gray-300 hover:bg-gray-600">
              Hide
            </button>
            <button onClick={bulkRemoveFromPlan}
              className="px-1.5 py-0.5 rounded text-[10px] bg-gray-700 text-orange-300 hover:bg-orange-700">
              Remove
            </button>
            <button onClick={bulkDelete}
              className="px-1.5 py-0.5 rounded text-[10px] bg-gray-700 text-red-300 hover:bg-red-700">
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Select all / hint */}
      {filteredOnPlan.length > 0 && multiSelected.size === 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-600 italic">Shift+click or use checkboxes to multi-select</span>
          <div className="flex-1" />
          <button onClick={selectAll} className="text-[10px] text-gray-500 hover:text-indigo-400">Select All</button>
        </div>
      )}

      {/* Quick-select search */}
      {onPlanSets.length > 5 && (
        <div className="relative">
          <input
            type="text"
            placeholder="Jump to set..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true) }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
            className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
          {searchOpen && searchQuery.trim() && (
            <div className="absolute z-10 w-full mt-0.5 bg-gray-800 border border-gray-600 rounded shadow-lg max-h-48 overflow-y-auto">
              {onPlanSets
                .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .slice(0, 15)
                .map(s => (
                  <button key={s.id}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setSelectedSetId(s.id)
                      setSearchQuery('')
                      setSearchOpen(false)
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-gray-700 ${
                      s.id === selectedSetId ? 'bg-indigo-900/40' : ''
                    }`}>
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="flex-1 truncate text-white">{s.name}</span>
                    <span className="text-[10px] text-gray-500">{s.category !== 'Set' ? s.category : ''}</span>
                  </button>
                ))}
              {onPlanSets.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                <div className="px-2 py-2 text-xs text-gray-500">No matches</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* On-plan sets — grouped into Sets and Components */}
      <div className="flex flex-col gap-2 overflow-y-auto">
        {sets.length === 0 && (
          <p className="text-gray-500 text-xs text-center py-4">No sets added yet</p>
        )}

        {/* Sets section */}
        {filteredSets.length > 0 && (
          <div>
            <button onClick={() => setSetsCollapsed(!setsCollapsed)}
              className="flex items-center justify-between w-full px-2 py-1.5 bg-gray-800 rounded text-xs text-gray-300 hover:bg-gray-700 mb-1">
              <span className="flex items-center gap-1.5">
                <span className="text-gray-500">{setsCollapsed ? '\u25B8' : '\u25BE'}</span>
                <span className="font-medium">Sets</span>
                <span className="text-[10px] text-gray-500">({filteredSets.length})</span>
              </span>
            </button>
            {!setsCollapsed && (
              <div className="flex flex-col gap-1">
                {filteredSets.map(s => renderSetRow(s))}
              </div>
            )}
          </div>
        )}

        {/* Components section (Windows, Doors, Walls) */}
        {filteredComponents.length > 0 && (
          <div>
            <button onClick={() => setComponentsCollapsed(!componentsCollapsed)}
              className="flex items-center justify-between w-full px-2 py-1.5 bg-gray-800 rounded text-xs text-amber-300 hover:bg-gray-700 mb-1">
              <span className="flex items-center gap-1.5">
                <span className="text-gray-500">{componentsCollapsed ? '\u25B8' : '\u25BE'}</span>
                <span className="font-medium">Components</span>
                <span className="text-[10px] text-gray-500">({filteredComponents.length})</span>
              </span>
            </button>
            {!componentsCollapsed && (
              <div className="flex flex-col gap-1">
                {filteredComponents.map(s => renderSetRow(s))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden sets */}
      {hiddenSets.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <div className="h-px bg-gray-600 flex-1" />
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Hidden</span>
            <div className="h-px bg-gray-600 flex-1" />
          </div>
          <div className="flex flex-col gap-1 overflow-y-auto">
            {hiddenSets.map(s => (
              <div
                key={s.id}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded text-sm bg-gray-800/50 opacity-60 hover:opacity-100"
              >
                <div className="w-3 h-3 rounded-sm shrink-0 opacity-50" style={{ backgroundColor: s.color }} />
                <span className="flex-1 truncate text-xs text-gray-400">{s.name}</span>
                <span className="text-[10px] text-gray-500">{WALL_CATEGORIES.includes(s.category) ? `${formatInUnit(s.width, inputUnit)}×${formatInUnit(s.wallHeight || defaultWallHeight, inputUnit)}×${formatInUnit(s.height, inputUnit)}` : `${formatInUnit(s.width, inputUnit)}×${formatInUnit(s.height, inputUnit)}`}</span>

                {/* Show on plan */}
                <button onClick={() => showSet(s.id)}
                  className="text-xs text-green-400 hover:text-green-300" title="Show on plan">
                  &#x1F441;
                </button>

                {/* Delete permanently */}
                <button onClick={() => deleteSet(s.id)}
                  className="text-xs text-red-400 hover:text-red-300" title="Delete permanently">
                  &#x2715;
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Off-plan sets */}
      {offPlanSets.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <div className="h-px bg-gray-600 flex-1" />
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Off Plan</span>
            <div className="h-px bg-gray-600 flex-1" />
          </div>
          <div className="flex flex-col gap-1 overflow-y-auto">
            {offPlanSets.map(s => (
              <div
                key={s.id}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded text-sm bg-gray-800/50 opacity-60 hover:opacity-100"
              >
                <div className="w-3 h-3 rounded-sm shrink-0 opacity-50" style={{ backgroundColor: s.color }} />
                <span className="flex-1 truncate text-xs text-gray-400">{s.name}</span>
                <span className="text-[10px] text-gray-500">{WALL_CATEGORIES.includes(s.category) ? `${formatInUnit(s.width, inputUnit)}×${formatInUnit(s.wallHeight || defaultWallHeight, inputUnit)}×${formatInUnit(s.height, inputUnit)}` : `${formatInUnit(s.width, inputUnit)}×${formatInUnit(s.height, inputUnit)}`}</span>

                {/* Add back to plan */}
                <button onClick={() => addSetToPlan(s.id)}
                  className="text-xs text-green-400 hover:text-green-300" title="Add back to plan">
                  &#x2B06;
                </button>

                {/* Delete permanently */}
                <button onClick={() => deleteSet(s.id)}
                  className="text-xs text-red-400 hover:text-red-300" title="Delete permanently">
                  &#x2715;
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
})
