import { useState } from 'react'
import useStore from '../store.js'
import BulkImport from './BulkImport.jsx'

const COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
]

export default function SetsTab() {
  const { sets, addSet, updateSet, deleteSet, selectedSetId, setSelectedSetId, unit } = useStore()
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

      <div className="flex flex-col gap-1 overflow-y-auto">
        {sets.length === 0 && (
          <p className="text-gray-500 text-xs text-center py-4">No sets added yet</p>
        )}
        {sets.map(set => (
          <div
            key={set.id}
            onClick={() => setSelectedSetId(set.id === selectedSetId ? null : set.id)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm
              ${set.id === selectedSetId ? 'bg-gray-600' : 'hover:bg-gray-700'}`}
          >
            <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: set.color }} />
            <span className="flex-1 truncate">{set.name}</span>
            <span className="text-xs text-gray-400">{set.width}x{set.height}</span>
            <button onClick={(e) => { e.stopPropagation(); startEdit(set) }}
              className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
            <button onClick={(e) => { e.stopPropagation(); deleteSet(set.id) }}
              className="text-xs text-red-400 hover:text-red-300">Del</button>
          </div>
        ))}
      </div>
    </div>
  )
}
