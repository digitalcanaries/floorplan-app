import { useState } from 'react'
import useStore from '../store.js'
import BulkImport from './BulkImport.jsx'

const COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
]

const CATEGORIES = ['Set', 'Wall', 'Window', 'Door', 'Furniture', 'Other']
const WALL_CATEGORIES = ['Wall', 'Window', 'Door']
const GAP_PRESETS = [
  { label: '1ft', value: 1, desc: 'Back-to-back' },
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
  } = useStore()
  const [form, setForm] = useState({
    name: '', width: '', height: '', color: COLORS[0],
    category: 'Set', wallGap: '', opacity: '1', noCut: false,
  })
  const [editing, setEditing] = useState(null)
  const [cuttingSetId, setCuttingSetId] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState(null) // null = show all

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
      opacity: parseFloat(form.opacity) || 1,
    })
    setForm({
      name: '', width: '', height: '', color: COLORS[(sets.length + 1) % COLORS.length],
      category: 'Set', wallGap: '', opacity: '1', noCut: false,
    })
  }

  const handleUpdate = (e) => {
    e.preventDefault()
    if (!form.name || !form.width || !form.height) return
    updateSet(editing, {
      name: form.name,
      width: parseFloat(form.width),
      height: parseFloat(form.height),
      color: form.color,
      category: form.category,
      noCut: form.noCut,
      wallGap: parseFloat(form.wallGap) || 0,
      opacity: parseFloat(form.opacity) || 1,
    })
    setEditing(null)
    setForm({
      name: '', width: '', height: '', color: COLORS[sets.length % COLORS.length],
      category: 'Set', wallGap: '', opacity: '1', noCut: false,
    })
  }

  const startEdit = (s) => {
    setEditing(s.id)
    setForm({
      name: s.name, width: String(s.width), height: String(s.height), color: s.color,
      category: s.category || 'Set', wallGap: String(s.wallGap || ''), opacity: String(s.opacity ?? 1),
      noCut: s.noCut || false,
    })
  }

  const cancelEdit = () => {
    setEditing(null)
    setForm({
      name: '', width: '', height: '', color: COLORS[sets.length % COLORS.length],
      category: 'Set', wallGap: '', opacity: '1', noCut: false,
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

  const onPlanSets = sets.filter(s => s.onPlan !== false && !s.hidden)
  const hiddenSets = sets.filter(s => s.onPlan !== false && s.hidden)
  const offPlanSets = sets.filter(s => s.onPlan === false)

  const filteredOnPlan = categoryFilter
    ? onPlanSets.filter(s => (s.category || 'Set') === categoryFilter)
    : onPlanSets

  return (
    <div className="p-3 flex flex-col gap-3">
      <BulkImport />

      <div className="h-px bg-gray-700" />

      <form onSubmit={editing ? handleUpdate : handleAdd} className="flex flex-col gap-2">
        <input
          type="text" placeholder="Set name" value={form.name}
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

        {/* Category selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Type:</label>
          <select
            value={form.category}
            onChange={e => handleCategoryChange(e.target.value)}
            className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white flex-1"
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
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
            {editing ? 'Update' : 'Add Set'}
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

      {/* On-plan visible sets */}
      <div className="flex flex-col gap-1 overflow-y-auto">
        {sets.length === 0 && (
          <p className="text-gray-500 text-xs text-center py-4">No sets added yet</p>
        )}
        {filteredOnPlan.map(s => (
          <div key={s.id}>
            <div
              onClick={() => setSelectedSetId(s.id === selectedSetId ? null : s.id)}
              className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer text-sm
                ${s.id === selectedSetId ? 'bg-gray-600' : 'hover:bg-gray-700'}
                ${s.lockedToPdf ? 'border border-amber-600/40' : ''}`}
            >
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
