import { useState, useRef, useEffect } from 'react'
import useStore from '../store.js'

// ── Action Registry ──────────────────────────────────────────────────
// Each action: { label, title, handler(setId, store), getState?(set), className? }

const ACTION_REGISTRY = {
  'rotate-cw-90': {
    label: '↻ 90°',
    title: 'Rotate 90° clockwise',
    handler: (id, store) => {
      const set = store.sets.find(s => s.id === id)
      if (set) store.updateSet(id, { rotation: ((set.rotation || 0) + 90) % 360 })
    },
  },
  'rotate-ccw-90': {
    label: '↺ 90°',
    title: 'Rotate 90° counter-clockwise',
    handler: (id, store) => {
      const set = store.sets.find(s => s.id === id)
      if (set) store.updateSet(id, { rotation: ((set.rotation || 0) - 90 + 360) % 360 })
    },
  },
  'rotate-plus-1': {
    label: '+1°',
    title: 'Rotate +1 degree',
    handler: (id, store) => {
      const set = store.sets.find(s => s.id === id)
      if (set) store.updateSet(id, { rotation: ((set.rotation || 0) + 1) % 360 })
    },
  },
  'rotate-minus-1': {
    label: '−1°',
    title: 'Rotate −1 degree',
    handler: (id, store) => {
      const set = store.sets.find(s => s.id === id)
      if (set) store.updateSet(id, { rotation: ((set.rotation || 0) - 1 + 360) % 360 })
    },
  },
  'edit': {
    label: '✎ Edit',
    title: 'Edit set properties (opens sidebar)',
    handler: (id, store) => {
      store.setSidebarTab('sets')
      // SetsTab auto-scrolls to selectedSetId
    },
  },
  'pin-pdf': {
    label: '📌 Pin to PDF',
    title: 'Toggle pin set to master PDF',
    handler: (id, store) => store.toggleLockToPdf(id),
    getState: (set) => set.lockedToPdf,
  },
  'duplicate': {
    label: '📋 Dup',
    title: 'Duplicate set',
    handler: (id, store) => store.duplicateSet(id),
  },
  'delete': {
    label: '🗑 Del',
    title: 'Delete set',
    className: 'text-red-400 hover:text-red-300 hover:bg-red-900/30',
    handler: (id, store) => store.deleteSet(id),
  },
  'flip-h': {
    label: '↔ Flip H',
    title: 'Flip horizontal',
    handler: (id, store) => {
      const set = store.sets.find(s => s.id === id)
      if (set) store.updateSet(id, { flipX: !set.flipX })
    },
    getState: (set) => set.flipX,
  },
  'flip-v': {
    label: '↕ Flip V',
    title: 'Flip vertical',
    handler: (id, store) => {
      const set = store.sets.find(s => s.id === id)
      if (set) store.updateSet(id, { flipY: !set.flipY })
    },
    getState: (set) => set.flipY,
  },
  'hide-label': {
    label: 'Aa',
    title: 'Toggle label visibility',
    handler: (id, store) => {
      const set = store.sets.find(s => s.id === id)
      if (set) store.updateSet(id, { labelHidden: !set.labelHidden })
    },
    getState: (set) => !set.labelHidden,
  },
  'no-cut': {
    label: '♯ No Cut',
    title: 'Toggle no-cut flag',
    handler: (id, store) => {
      const set = store.sets.find(s => s.id === id)
      if (set) store.updateSet(id, { noCut: !set.noCut })
    },
    getState: (set) => set.noCut,
  },
  'bring-forward': {
    label: '▲ Fwd',
    title: 'Bring forward (z-order)',
    handler: (id, store) => store.bringForward(id),
  },
  'send-backward': {
    label: '▼ Back',
    title: 'Send backward (z-order)',
    handler: (id, store) => store.sendBackward(id),
  },
  'remove-plan': {
    label: '⬇ Off Plan',
    title: 'Remove from plan',
    handler: (id, store) => store.removeSetFromPlan(id),
  },
  'hide': {
    label: '👁 Hide',
    title: 'Hide set (keeps on plan)',
    handler: (id, store) => store.hideSet(id),
  },
}

const DEFAULT_ACTIONS = [
  'rotate-cw-90', 'rotate-ccw-90', 'rotate-plus-1', 'rotate-minus-1',
  'edit', 'pin-pdf', 'duplicate', 'delete',
]

const PREFS_KEY = 'floorplan-quick-actions'

function loadPreferences() {
  try {
    const data = localStorage.getItem(PREFS_KEY)
    if (data) {
      const parsed = JSON.parse(data)
      // Filter out any stale action IDs
      return parsed.filter(id => ACTION_REGISTRY[id])
    }
  } catch {}
  return [...DEFAULT_ACTIONS]
}

function savePreferences(actions) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(actions)) } catch {}
}

export default function QuickActionsBar() {
  const selectedSetId = useStore(s => s.selectedSetId)
  const sets = useStore(s => s.sets)
  const selectedSet = sets.find(s => s.id === selectedSetId)

  const [actions, setActions] = useState(() => loadPreferences())
  const [showAddMenu, setShowAddMenu] = useState(false)
  const menuRef = useRef(null)

  // Close add menu when clicking outside
  useEffect(() => {
    if (!showAddMenu) return
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowAddMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showAddMenu])

  // Hidden when nothing selected
  if (!selectedSet) return null

  const availableToAdd = Object.keys(ACTION_REGISTRY).filter(id => !actions.includes(id))

  const addAction = (id) => {
    const next = [...actions, id]
    setActions(next)
    savePreferences(next)
  }

  const removeAction = (id) => {
    const next = actions.filter(a => a !== id)
    setActions(next)
    savePreferences(next)
  }

  const rot = selectedSet.rotation || 0

  return (
    <div className="flex items-center gap-0.5 px-3 py-1 bg-gray-800/90 border-b border-gray-700 text-xs select-none">
      {/* Set name + rotation indicator */}
      <div className="flex items-center gap-1.5 mr-2 min-w-0">
        <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: selectedSet.color }} />
        <span className="text-gray-300 truncate max-w-[120px] font-medium" title={selectedSet.name}>
          {selectedSet.name}
        </span>
        {rot !== 0 && (
          <span className="text-gray-500 text-[10px]">{rot}°</span>
        )}
      </div>

      <div className="h-4 w-px bg-gray-600 mx-1" />

      {/* Action buttons */}
      {actions.map(actionId => {
        const action = ACTION_REGISTRY[actionId]
        if (!action) return null
        const isActive = action.getState?.(selectedSet)
        return (
          <button
            key={actionId}
            onClick={() => action.handler(selectedSetId, useStore.getState())}
            onContextMenu={(e) => { e.preventDefault(); removeAction(actionId) }}
            className={`px-1.5 py-0.5 rounded text-[11px] whitespace-nowrap transition-colors ${
              action.className || (isActive
                ? 'text-cyan-300 bg-cyan-900/40 hover:bg-cyan-900/60'
                : 'text-gray-400 hover:text-white hover:bg-gray-700')
            }`}
            title={`${action.title}\nRight-click to remove`}
          >
            {action.label}
          </button>
        )
      })}

      <div className="h-4 w-px bg-gray-600 mx-1" />

      {/* Add action button */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-700 text-sm"
          title="Add action to toolbar"
        >
          +
        </button>
        {showAddMenu && (
          <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg z-50 min-w-[180px] max-h-[300px] overflow-y-auto">
            {availableToAdd.length > 0 ? availableToAdd.map(id => (
              <button
                key={id}
                onClick={() => { addAction(id); setShowAddMenu(false) }}
                className="block w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white"
              >
                {ACTION_REGISTRY[id].label} — {ACTION_REGISTRY[id].title}
              </button>
            )) : (
              <div className="px-3 py-2 text-gray-500 text-xs">All actions added</div>
            )}
            {actions.length > 0 && (
              <>
                <div className="border-t border-gray-700 my-1" />
                <button
                  onClick={() => { setActions([...DEFAULT_ACTIONS]); savePreferences([...DEFAULT_ACTIONS]); setShowAddMenu(false) }}
                  className="block w-full text-left px-3 py-1.5 text-xs text-amber-400 hover:bg-gray-700"
                >
                  Reset to defaults
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
