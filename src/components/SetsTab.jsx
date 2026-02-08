import { useState } from 'react'
import useStore from '../store.js'
import BulkImport from './BulkImport.jsx'

const COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
]

export default function SetsTab() {
  const {
    sets, addSet, updateSet, deleteSet, selectedSetId, setSelectedSetId, unit,
    pdfImage, toggleLockToPdf, lockAllToPdf, unlockAllFromPdf,
    duplicateSet, removeSetFromPlan, addSetToPlan,
  } = useStore()
  const [form, setForm] = useState({ name: '', width: '', height: '', color: COLORS[0] })
  const [editing, setEditing] = useState(null)

  const handleAdd = (e) => {
    e.preventDefault()
    if (!form.name || !form.width || !form.height) return
    addSet({
      name: form.name,
      width: parseFloat(form.width),
      height: parseFloat(form.height),
      color: form.color,
    })
    setForm({ name: '', width: '', height: '', color: COLORS[(sets.length + 1) % COLORS.length] })
  }

  const handleUpdate = (e) => {
    e.preventDefault()
    if (!form.name || !form.width || !form.height) return
    updateSet(editing, {
      name: form.name,
      width: parseFloat(form.width),
      height: parseFloat(form.height),
      color: form.color,
    })
    setEditing(null)
    setForm({ name: '', width: '', height: '', color: COLORS[sets.length % COLORS.length] })
  }

  const startEdit = (set) => {
    setEditing(set.id)
    setForm({ name: set.name, width: String(set.width), height: String(set.height), color: set.color })
  }

  const cancelEdit = () => {
    setEditing(null)
    setForm({ name: '', width: '', height: '', color: COLORS[sets.length % COLORS.length] })
  }

  const handleRotate = (e, setData) => {
    e.stopPropagation()
    const newRot = ((setData.rotation || 0) + 90) % 360
    updateSet(setData.id, { rotation: newRot })
  }

  const onPlanSets = sets.filter(s => s.onPlan !== false)
  const offPlanSets = sets.filter(s => s.onPlan === false)

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

      {/* On-plan sets */}
      <div className="flex flex-col gap-1 overflow-y-auto">
        {sets.length === 0 && (
          <p className="text-gray-500 text-xs text-center py-4">No sets added yet</p>
        )}
        {onPlanSets.map(s => (
          <div
            key={s.id}
            onClick={() => setSelectedSetId(s.id === selectedSetId ? null : s.id)}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer text-sm
              ${s.id === selectedSetId ? 'bg-gray-600' : 'hover:bg-gray-700'}
              ${s.lockedToPdf ? 'border border-amber-600/40' : ''}`}
          >
            <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            <span className="flex-1 truncate text-xs">{s.name}</span>
            <span className="text-[10px] text-gray-400">{s.width}x{s.height}</span>

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

            {/* Duplicate */}
            <button onClick={(e) => { e.stopPropagation(); duplicateSet(s.id) }}
              className="text-xs text-cyan-400 hover:text-cyan-300" title="Duplicate set">
              &#x29C9;
            </button>

            {/* Remove from plan (not delete) */}
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
        ))}
      </div>

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
