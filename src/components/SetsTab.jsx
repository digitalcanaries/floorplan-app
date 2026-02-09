import { useState } from 'react'
import useStore from '../store.js'
import { getAABB } from '../engine/geometry.js'
import BulkImport from './BulkImport.jsx'

const COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
]

const CATEGORIES = ['Set', 'Wall', 'Window', 'Door', 'Furniture', 'Other']
const WALL_CATEGORIES = ['Wall', 'Window', 'Door']
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

export default function SetsTab() {
  const {
    sets, addSet, updateSet, deleteSet, selectedSetId, setSelectedSetId, unit,
    pdfImage, toggleLockToPdf, lockAllToPdf, unlockAllFromPdf,
    duplicateSet, removeSetFromPlan, addSetToPlan, clearCutouts,
    hideSet, showSet, cutIntoSet,
    bringForward, sendBackward, bringToFront, sendToBack,
    labelMode,
    addGroup,
  } = useStore()
  const { defaultWallHeight, setDefaultWallHeight } = useStore()
  const [form, setForm] = useState({
    name: '', width: '', height: '', color: COLORS[0],
    category: 'Set', wallGap: '', opacity: '1', noCut: false,
    wallHeight: '', gapSides: { top: true, right: true, bottom: true, left: true },
  })
  const [editing, setEditing] = useState(null)
  const [cuttingSetId, setCuttingSetId] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState(null)
  const [multiSelected, setMultiSelected] = useState(new Set())

  const handleAdd = (e) => {
    e.preventDefault()
    if (!form.name || !form.width || !form.height) return
    const isWallType = WALL_CATEGORIES.includes(form.category)
    addSet({
      name: form.name,
      width: parseFloat(form.width),
      height: parseFloat(form.height),
      color: form.color,
      category: form.category,
      noCut: form.noCut || isWallType,
      wallGap: parseFloat(form.wallGap) || 0,
      wallHeight: isWallType ? (parseFloat(form.wallHeight) || defaultWallHeight) : null,
      gapSides: isWallType && parseFloat(form.wallGap) > 0 ? form.gapSides : null,
      opacity: parseFloat(form.opacity) || 1,
    })
    setForm({
      name: '', width: '', height: '', color: COLORS[(sets.length + 1) % COLORS.length],
      category: 'Set', wallGap: '', opacity: '1', noCut: false,
      wallHeight: '', gapSides: { top: true, right: true, bottom: true, left: true },
    })
  }

  const handleUpdate = (e) => {
    e.preventDefault()
    if (!form.name || !form.width || !form.height) return
    const isWallType = WALL_CATEGORIES.includes(form.category)
    updateSet(editing, {
      name: form.name,
      width: parseFloat(form.width),
      height: parseFloat(form.height),
      color: form.color,
      category: form.category,
      noCut: form.noCut,
      wallGap: parseFloat(form.wallGap) || 0,
      wallHeight: isWallType ? (parseFloat(form.wallHeight) || defaultWallHeight) : null,
      gapSides: isWallType && parseFloat(form.wallGap) > 0 ? form.gapSides : null,
      opacity: parseFloat(form.opacity) || 1,
    })
    setEditing(null)
    setForm({
      name: '', width: '', height: '', color: COLORS[sets.length % COLORS.length],
      category: 'Set', wallGap: '', opacity: '1', noCut: false,
      wallHeight: '', gapSides: { top: true, right: true, bottom: true, left: true },
    })
  }

  const startEdit = (s) => {
    setEditing(s.id)
    setMultiSelected(new Set())
    setForm({
      name: s.name, width: String(s.width), height: String(s.height), color: s.color,
      category: s.category || 'Set', wallGap: String(s.wallGap || ''), opacity: String(s.opacity ?? 1),
      noCut: s.noCut || false,
      wallHeight: String(s.wallHeight || ''),
      gapSides: s.gapSides || { top: true, right: true, bottom: true, left: true },
    })
  }

  const cancelEdit = () => {
    setEditing(null)
    setForm({
      name: '', width: '', height: '', color: COLORS[sets.length % COLORS.length],
      category: 'Set', wallGap: '', opacity: '1', noCut: false,
      wallHeight: '', gapSides: { top: true, right: true, bottom: true, left: true },
    })
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

  return (
    <div className="p-3 flex flex-col gap-3">
      <BulkImport />

      {/* Global default wall height */}
      <div className="flex items-center gap-2 px-1">
        <label className="text-[10px] text-gray-400 whitespace-nowrap">Default Wall Height:</label>
        <input
          type="number" value={defaultWallHeight} min="1" step="1"
          onChange={e => setDefaultWallHeight(parseFloat(e.target.value) || 12)}
          className="px-1.5 py-0.5 bg-gray-700 border border-gray-600 rounded text-[10px] text-white w-12"
        />
        <span className="text-[10px] text-gray-500">{unit}</span>
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
        <div className="flex gap-2">
          <input
            type="number" placeholder={`W (${unit})`} value={form.width} min="1" step="0.5"
            onChange={e => setForm({ ...form, width: e.target.value })}
            className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white w-1/2"
          />
          <input
            type="number" placeholder={`H (${unit})`} value={form.height} min="1" step="0.5"
            onChange={e => setForm({ ...form, height: e.target.value })}
            className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white w-1/2"
          />
        </div>

        {/* Wall gap — shown for Wall/Window/Door */}
        {WALL_CATEGORIES.includes(form.category) && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Access Gap ({unit}):</label>
              <input
                type="number" placeholder="0" value={form.wallGap} min="0" step="0.5"
                onChange={e => setForm({ ...form, wallGap: e.target.value })}
                className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white w-16"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {GAP_PRESETS.map(p => (
                <button key={p.value} type="button"
                  onClick={() => setForm({ ...form, wallGap: String(p.value) })}
                  className={`px-1.5 py-0.5 rounded text-[10px] border ${
                    form.wallGap === String(p.value) ? 'bg-amber-700 border-amber-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'
                  }`}
                  title={p.desc}
                >
                  {p.label} <span className="text-gray-500">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Wall height — shown for Wall/Window/Door */}
        {WALL_CATEGORIES.includes(form.category) && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Height ({unit}):</label>
            <input
              type="number" placeholder={String(defaultWallHeight)} value={form.wallHeight} min="1" step="1"
              onChange={e => setForm({ ...form, wallHeight: e.target.value })}
              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white w-16"
            />
            <span className="text-[10px] text-gray-500">default: {defaultWallHeight}{unit}</span>
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
        <div className="flex gap-2">
          <button type="submit"
            className="flex-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-sm text-white">
            {editing ? `Update ${form.category}` : `Add ${form.category}`}
          </button>
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

      {/* On-plan visible sets */}
      <div className="flex flex-col gap-1 overflow-y-auto">
        {sets.length === 0 && (
          <p className="text-gray-500 text-xs text-center py-4">No sets added yet</p>
        )}
        {filteredOnPlan.map(s => (
          <div key={s.id}>
            <div
              onClick={(e) => handleSetClick(e, s.id)}
              title={`${s.name} — ${s.width}${unit} x ${s.height}${unit}${s.category && s.category !== 'Set' ? ` [${s.category}]` : ''}${s.wallGap > 0 ? ` Gap: ${s.wallGap}${unit}` : ''}${s.lockedToPdf ? ' [Locked]' : ''}${s.noCut ? ' [No Cut]' : ''}${s.rotation ? ` ${s.rotation}\u00B0` : ''}`}
              className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer text-sm
                ${multiSelected.has(s.id) ? 'bg-indigo-900/40 border border-indigo-500/50' : s.id === selectedSetId ? 'bg-gray-600' : 'hover:bg-gray-700'}
                ${s.lockedToPdf && !multiSelected.has(s.id) ? 'border border-amber-600/40' : ''}`}
            >
              {/* Multi-select checkbox */}
              <input
                type="checkbox"
                checked={multiSelected.has(s.id)}
                onChange={(e) => toggleMultiSelect(e, s.id)}
                onClick={(e) => e.stopPropagation()}
                className="w-3 h-3 shrink-0 accent-indigo-500 cursor-pointer"
              />

              <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.color, opacity: s.opacity ?? 1 }} />
              <span className="flex-1 truncate text-xs">{s.name}</span>

              {/* Category badge */}
              {(s.category && s.category !== 'Set') && (
                <span className={`text-[9px] ${CATEGORY_COLORS[s.category] || 'text-gray-500'}`}>
                  {s.category}
                </span>
              )}

              <span className="text-[10px] text-gray-400">{s.width}x{s.height}</span>

              {/* Wall gap indicator */}
              {s.wallGap > 0 && (
                <span className="text-[9px] text-amber-500" title={`${s.wallGap}${unit} access gap`}>
                  {s.wallGap}{unit}
                </span>
              )}

              {/* No-cut shield */}
              {s.noCut && (
                <span className="text-[10px] text-gray-500" title="No cut">&#x1F6E1;</span>
              )}

              {/* Cut indicator + restore */}
              {s.cutouts?.length > 0 && (
                <button onClick={(e) => { e.stopPropagation(); clearCutouts(s.id) }}
                  className="text-[10px] text-red-400 hover:text-yellow-300" title="Restore original shape">
                  [cut] &#x21A9;
                </button>
              )}

              {/* Cut into another set — only if not noCut */}
              {!s.noCut && (
                <button onClick={(e) => { e.stopPropagation(); setCuttingSetId(cuttingSetId === s.id ? null : s.id) }}
                  className={`text-xs ${cuttingSetId === s.id ? 'text-red-400' : 'text-gray-500 hover:text-red-300'}`}
                  title="Cut this set into another set">
                  &#x2702;
                </button>
              )}

              {/* Lock to PDF button */}
              {pdfImage && (
                <button onClick={(e) => { e.stopPropagation(); toggleLockToPdf(s.id) }}
                  className={`text-xs ${s.lockedToPdf ? 'text-amber-400' : 'text-gray-500 hover:text-amber-300'}`}
                  title={s.lockedToPdf ? 'Unlock from PDF' : 'Lock to PDF position'}>
                  {s.lockedToPdf ? '\u{1F4CC}' : '\u{1F4CD}'}
                </button>
              )}

              {/* Rotate */}
              <button onClick={(e) => handleRotate(e, s)}
                className="text-xs text-yellow-400 hover:text-yellow-300" title={`Rotate (${s.rotation || 0}\u00B0)`}>
                &#x21BB;
              </button>

              {/* Z-order */}
              <button onClick={(e) => { e.stopPropagation(); bringForward(s.id) }}
                className="text-[10px] text-gray-500 hover:text-white" title="Bring forward">
                &#x25B2;
              </button>
              <button onClick={(e) => { e.stopPropagation(); sendBackward(s.id) }}
                className="text-[10px] text-gray-500 hover:text-white" title="Send backward">
                &#x25BC;
              </button>

              {/* Label visibility toggle */}
              <button onClick={(e) => { e.stopPropagation(); updateSet(s.id, { labelHidden: !s.labelHidden }) }}
                className={`text-[10px] ${s.labelHidden ? 'text-gray-600' : 'text-gray-400 hover:text-white'}`}
                title={s.labelHidden ? 'Show label' : 'Hide label'}>
                Aa
              </button>

              {/* Label position (only in inline mode) */}
              {!s.labelHidden && labelMode === 'inline' && (
                <select value={s.labelPosition || 'top-left'}
                  onClick={e => e.stopPropagation()}
                  onChange={e => { e.stopPropagation(); updateSet(s.id, { labelPosition: e.target.value }) }}
                  className="text-[9px] bg-gray-700 border border-gray-600 rounded text-gray-400 px-0.5 py-0 w-8"
                  title="Label position">
                  <option value="top-left">TL</option>
                  <option value="top">T</option>
                  <option value="top-right">TR</option>
                  <option value="left">L</option>
                  <option value="center">C</option>
                  <option value="right">R</option>
                  <option value="bottom-left">BL</option>
                  <option value="bottom">B</option>
                  <option value="bottom-right">BR</option>
                </select>
              )}

              {/* Duplicate */}
              <button onClick={(e) => { e.stopPropagation(); duplicateSet(s.id) }}
                className="text-xs text-cyan-400 hover:text-cyan-300" title="Duplicate set">
                &#x29C9;
              </button>

              {/* Hide from plan (keep position) */}
              <button onClick={(e) => { e.stopPropagation(); hideSet(s.id) }}
                className="text-xs text-gray-500 hover:text-gray-300" title="Hide from plan (keep position)">
                &#x1F441;
              </button>

              {/* Remove from plan (reset position) */}
              <button onClick={(e) => { e.stopPropagation(); removeSetFromPlan(s.id) }}
                className="text-xs text-orange-400 hover:text-orange-300" title="Remove from plan (keep in list)">
                &#x2B07;
              </button>

              {/* Edit */}
              <button onClick={(e) => { e.stopPropagation(); startEdit(s) }}
                className="text-xs text-blue-400 hover:text-blue-300" title="Edit set">
                &#x270E;
              </button>

              {/* Delete permanently */}
              <button onClick={(e) => { e.stopPropagation(); deleteSet(s.id) }}
                className="text-xs text-red-400 hover:text-red-300" title="Delete permanently">
                &#x2715;
              </button>
            </div>

            {/* Cut-into target picker */}
            {cuttingSetId === s.id && (
              <div className="ml-6 mt-1 mb-1 p-2 bg-gray-800 rounded border border-red-700/50">
                <p className="text-[10px] text-gray-400 mb-1">Cut <span className="text-white">{s.name}</span> into:</p>
                <div className="flex flex-col gap-0.5">
                  {onPlanSets.filter(t => t.id !== s.id && !t.noCut).map(t => (
                    <button key={t.id}
                      onClick={() => handleCutInto(s.id, t.id)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-left hover:bg-red-900/30 transition-colors"
                    >
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.color }} />
                      <span className="text-gray-300">{t.name}</span>
                      <span className="text-[9px] text-gray-500">{t.width}x{t.height}</span>
                    </button>
                  ))}
                  {onPlanSets.filter(t => t.id !== s.id && !t.noCut).length === 0 && (
                    <p className="text-[10px] text-gray-500">No cuttable sets on plan</p>
                  )}
                </div>
                <button onClick={() => setCuttingSetId(null)}
                  className="mt-1 text-[10px] text-gray-500 hover:text-gray-300">
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
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
                <span className="text-[10px] text-gray-500">{s.width}x{s.height}</span>

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
                <span className="text-[10px] text-gray-500">{s.width}x{s.height}</span>

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
}
