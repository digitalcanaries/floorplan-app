import { useEffect, useState } from 'react'
import useStore from '../store.js'

const COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
  '#000000', '#ffffff',
]
const CATEGORIES = ['Set', 'Wall', 'Window', 'Door', 'Furniture', 'Other']
const WALL_CATEGORIES = ['Wall', 'Window', 'Door']

// Modal-style edit dialog launched from QuickActionsBar's '✎ Edit' button.
// Lives at the App level so it's reachable when the sidebar is collapsed
// (the previous edit handler tried to switch sidebar tabs, which was a
// no-op on iPad). Closes on Escape, on Cancel, or on Save (after
// committing fields via updateSet).
export default function EditSetModal() {
  const editingSetId = useStore(s => s.editingSetId)
  const setEditingSetId = useStore(s => s.setEditingSetId)
  const sets = useStore(s => s.sets)
  const updateSet = useStore(s => s.updateSet)
  const deleteSet = useStore(s => s.deleteSet)
  const defaultWallHeight = useStore(s => s.defaultWallHeight)

  const set = sets.find(s => s.id === editingSetId)

  const [form, setForm] = useState(null)

  // Sync form when the editing target changes
  useEffect(() => {
    if (!set) { setForm(null); return }
    setForm({
      name: set.name || '',
      width: String(set.width ?? ''),
      height: String(set.height ?? ''),     // depth on the floor plan
      wallHeight: String(set.wallHeight ?? defaultWallHeight ?? 10),
      color: set.color || COLORS[0],
      category: set.category || 'Set',
      opacity: set.opacity ?? 1,
      noCut: !!set.noCut,
    })
  }, [set?.id, defaultWallHeight])

  // Esc closes the modal
  useEffect(() => {
    if (!editingSetId) return
    const onKey = (e) => { if (e.key === 'Escape') setEditingSetId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingSetId, setEditingSetId])

  if (!set || !form) return null

  const w = parseFloat(form.width) || 0
  const d = parseFloat(form.height) || 0
  const floorArea = w * d

  const handleSave = () => {
    updateSet(set.id, {
      name: form.name || `Set ${set.id}`,
      width: w,
      height: d,
      wallHeight: parseFloat(form.wallHeight) || defaultWallHeight,
      color: form.color,
      category: form.category,
      opacity: form.opacity,
      noCut: form.noCut,
    })
    setEditingSetId(null)
  }

  const handleDelete = () => {
    if (!window.confirm(`Delete "${set.name}"? This cannot be undone (use Ctrl+Z to bring it back).`)) return
    deleteSet(set.id)
    setEditingSetId(null)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
      onClick={() => setEditingSetId(null)}>
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-md border border-gray-600"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-700">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: form.color }} />
            Edit Set
          </h2>
          <button onClick={() => setEditingSetId(null)}
            className="text-gray-400 hover:text-white text-2xl leading-none px-2">
            ×
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[11px] text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
              className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">Width (ft)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={form.width}
                onChange={(e) => setForm({ ...form, width: e.target.value })}
                className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">Depth (ft)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={form.height}
                onChange={(e) => setForm({ ...form, height: e.target.value })}
                className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">Height (ft)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={form.wallHeight}
                onChange={(e) => setForm({ ...form, wallHeight: e.target.value })}
                className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="text-[11px] text-gray-500">
            Floor area: {floorArea > 0 ? floorArea.toFixed(floorArea >= 10 ? 0 : 1) : '—'} ft²
            {WALL_CATEGORIES.includes(form.category) && form.wallHeight && form.width &&
              ` · Face area: ${(parseFloat(form.width) * parseFloat(form.wallHeight)).toFixed(0)} ft²`}
          </div>

          <div>
            <label className="block text-[11px] text-gray-400 mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-gray-400 mb-1">Color</label>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-md border-2 transition-transform ${
                    form.color === c ? 'border-white scale-110' : 'border-gray-700'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-gray-400 mb-1">
              Opacity: {Math.round(form.opacity * 100)}%
            </label>
            <input
              type="range"
              min="0.1" max="1" step="0.05"
              value={form.opacity}
              onChange={(e) => setForm({ ...form, opacity: parseFloat(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300 select-none">
            <input
              type="checkbox"
              checked={form.noCut}
              onChange={(e) => setForm({ ...form, noCut: e.target.checked })}
              className="accent-indigo-500"
            />
            No cut (other sets can't carve into this one)
          </label>
        </div>

        <div className="px-4 py-3 border-t border-gray-700 flex items-center gap-2">
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded text-sm"
          >
            Delete
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setEditingSetId(null)}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
