import { useState } from 'react'
import useStore from '../store.js'

const RULE_TYPES = ['NEAR', 'CONNECT', 'SEPARATE', 'FIXED']

export default function RulesTab() {
  const { sets, rules, addRule, deleteRule } = useStore()
  const [form, setForm] = useState({ type: 'NEAR', setA: '', setB: '', distance: '100' })

  const handleAdd = (e) => {
    e.preventDefault()
    if (!form.setA) return
    if (form.type !== 'FIXED' && !form.setB) return

    addRule({
      type: form.type,
      setA: parseInt(form.setA),
      setB: form.type === 'FIXED' ? null : parseInt(form.setB),
      distance: parseFloat(form.distance) || 100,
    })
    setForm({ type: 'NEAR', setA: '', setB: '', distance: '100' })
  }

  const getSetName = (id) => {
    const s = sets.find(s => s.id === id)
    return s ? s.name : `Set #${id}`
  }

  const ruleLabel = (rule) => {
    if (rule.type === 'FIXED') return `${getSetName(rule.setA)} → FIXED`
    return `${getSetName(rule.setA)} → ${rule.type} → ${getSetName(rule.setB)}${rule.type !== 'CONNECT' ? ` (${rule.distance} units)` : ''}`
  }

  return (
    <div className="p-3 flex flex-col gap-3">
      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
          className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white">
          {RULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select value={form.setA} onChange={e => setForm({ ...form, setA: e.target.value })}
          className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white">
          <option value="">Select Set A...</option>
          {sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {form.type !== 'FIXED' && (
          <select value={form.setB} onChange={e => setForm({ ...form, setB: e.target.value })}
            className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white">
            <option value="">Select Set B...</option>
            {sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}

        {(form.type === 'NEAR' || form.type === 'SEPARATE') && (
          <input type="number" placeholder="Distance (units)" value={form.distance} min="1"
            onChange={e => setForm({ ...form, distance: e.target.value })}
            className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
          />
        )}

        <button type="submit" disabled={sets.length < (form.type === 'FIXED' ? 1 : 2)}
          className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded text-sm text-white">
          Add Rule
        </button>
      </form>

      <div className="flex flex-col gap-1 overflow-y-auto">
        {rules.length === 0 && (
          <p className="text-gray-500 text-xs text-center py-4">No rules added yet</p>
        )}
        {rules.map(rule => (
          <div key={rule.id}
            className="flex items-center gap-2 px-2 py-1.5 bg-gray-700/50 rounded text-xs">
            <span className={`px-1 py-0.5 rounded text-[10px] font-bold
              ${rule.type === 'NEAR' ? 'bg-green-800 text-green-200' :
                rule.type === 'CONNECT' ? 'bg-blue-800 text-blue-200' :
                rule.type === 'SEPARATE' ? 'bg-red-800 text-red-200' :
                'bg-yellow-800 text-yellow-200'}`}>
              {rule.type}
            </span>
            <span className="flex-1 truncate text-gray-300">{ruleLabel(rule)}</span>
            <button onClick={() => deleteRule(rule.id)}
              className="text-red-400 hover:text-red-300 text-xs">Del</button>
          </div>
        ))}
      </div>
    </div>
  )
}
