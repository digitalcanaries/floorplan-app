import { useState, useEffect } from 'react'
import useStore from '../store.js'
import { apiFetch } from '../api.js'
import FlatBuilder from './FlatBuilder.jsx'

const CATEGORY_ICONS = {
  Wall: '🧱',
  Window: '🪟',
  Door: '🚪',
  Other: '📐',
}

const CATEGORY_COLORS = {
  Wall: 'border-amber-500/40 bg-amber-900/20',
  Window: 'border-cyan-500/40 bg-cyan-900/20',
  Door: 'border-green-500/40 bg-green-900/20',
  Other: 'border-gray-500/40 bg-gray-800/50',
}

const CATEGORY_TEXT = {
  Wall: 'text-amber-400',
  Window: 'text-cyan-400',
  Door: 'text-green-400',
  Other: 'text-gray-400',
}

export default function BuildTab() {
  const { addSet, unit, viewMode, setViewMode } = useStore()
  const [components, setComponents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedCategory, setExpandedCategory] = useState('Wall')
  const [showFlatBuilder, setShowFlatBuilder] = useState(false)
  const [builderMode, setBuilderMode] = useState('flat') // flat, window, door
  const [searchTerm, setSearchTerm] = useState('')

  // Load components from API
  useEffect(() => {
    loadComponents()
  }, [])

  const loadComponents = async () => {
    try {
      setLoading(true)
      const data = await apiFetch('/components')
      setComponents(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Group components by category then subcategory
  const grouped = {}
  const filteredComponents = searchTerm.trim()
    ? components.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.subcategory || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    : components

  for (const c of filteredComponents) {
    if (!grouped[c.category]) grouped[c.category] = {}
    const sub = c.subcategory || 'General'
    if (!grouped[c.category][sub]) grouped[c.category][sub] = []
    grouped[c.category][sub].push(c)
  }

  const handleAddToCanvas = (comp) => {
    const categoryMap = { Wall: 'Wall', Window: 'Window', Door: 'Door', Other: 'Other' }
    const noCut = ['Wall', 'Window', 'Door'].includes(comp.category)
    addSet({
      name: comp.name,
      width: comp.width,
      height: comp.height,
      color: getDefaultColor(comp.category),
      category: categoryMap[comp.category] || 'Set',
      noCut,
      iconType: comp.icon_type || 'rect',
      thickness: comp.thickness,
      componentTypeId: comp.id,
      componentProperties: comp.properties || null,
      wallGap: noCut ? 1 : 0,
      opacity: comp.category === 'Window' ? 0.7 : 1,
    })
  }

  const handleDeleteCustom = async (id) => {
    try {
      await apiFetch(`/components/${id}`, { method: 'DELETE' })
      loadComponents()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleBuilderSave = async (newComp) => {
    try {
      const saved = await apiFetch('/components', {
        method: 'POST',
        body: JSON.stringify(newComp),
      })
      await loadComponents()
      // Also add to canvas
      handleAddToCanvas(saved)
      setShowFlatBuilder(false)
    } catch (e) {
      setError(e.message)
    }
  }

  const categories = ['Wall', 'Window', 'Door', 'Other']

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Component Library</h3>
        <span className="text-[10px] text-gray-500">{components.length} items</span>
      </div>

      {/* View Mode Toggle */}
      <div className="flex items-center gap-2 bg-gray-900 rounded p-1.5">
        <span className="text-[10px] text-gray-500 shrink-0">Icon Style:</span>
        <button
          onClick={() => setViewMode('plan')}
          className={`flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
            viewMode === 'plan'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          ⬇ Plan (Top-Down)
        </button>
        <button
          onClick={() => setViewMode('elevation')}
          className={`flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
            viewMode === 'elevation'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          ▶ Elevation (Face)
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search components..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
      />

      {/* Create Custom buttons */}
      <div className="flex gap-1.5">
        <button
          onClick={() => { setBuilderMode('flat'); setShowFlatBuilder(true) }}
          className="flex-1 px-2 py-1.5 bg-amber-700 hover:bg-amber-600 text-white text-[11px] rounded transition-colors"
        >
          + Flat
        </button>
        <button
          onClick={() => { setBuilderMode('window'); setShowFlatBuilder(true) }}
          className="flex-1 px-2 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white text-[11px] rounded transition-colors"
        >
          + Window
        </button>
        <button
          onClick={() => { setBuilderMode('door'); setShowFlatBuilder(true) }}
          className="flex-1 px-2 py-1.5 bg-green-700 hover:bg-green-600 text-white text-[11px] rounded transition-colors"
        >
          + Door
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-2 py-1.5 rounded text-[11px]">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-xs text-center py-4">Loading library...</p>
      ) : (
        /* Category accordions */
        <div className="flex flex-col gap-1">
          {categories.map(cat => {
            const subcats = grouped[cat]
            if (!subcats) return null
            const isExpanded = expandedCategory === cat
            const totalCount = Object.values(subcats).reduce((sum, arr) => sum + arr.length, 0)

            return (
              <div key={cat} className={`border rounded ${CATEGORY_COLORS[cat]}`}>
                {/* Category header */}
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm">{CATEGORY_ICONS[cat]}</span>
                    <span className={`text-xs font-semibold ${CATEGORY_TEXT[cat]}`}>{cat}s</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">{totalCount}</span>
                    <span className="text-gray-500 text-xs">{isExpanded ? '▾' : '▸'}</span>
                  </span>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-gray-700/50 px-2 pb-2">
                    {Object.entries(subcats).map(([subName, items]) => (
                      <div key={subName} className="mt-2">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider px-1 mb-1">{subName}</p>
                        <div className="flex flex-col gap-0.5">
                          {items.map(comp => (
                            <div
                              key={comp.id}
                              className="flex items-center justify-between px-2 py-1.5 bg-gray-800/50 hover:bg-gray-700/50 rounded group transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="text-[11px] text-white block truncate">{comp.name}</span>
                                <span className="text-[10px] text-gray-500">
                                  {comp.width}×{comp.height} {unit}
                                  {comp.thickness ? ` · ${comp.thickness}' thick` : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {!comp.is_default && (
                                  <button
                                    onClick={() => handleDeleteCustom(comp.id)}
                                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 text-xs px-1 transition-opacity"
                                    title="Delete custom component"
                                  >
                                    ×
                                  </button>
                                )}
                                <button
                                  onClick={() => handleAddToCanvas(comp)}
                                  className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] rounded transition-colors"
                                >
                                  Add
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {Object.keys(grouped).length === 0 && (
            <p className="text-gray-500 text-xs text-center py-4">No components match your search</p>
          )}
        </div>
      )}

      {/* Suggest Flats section */}
      <SuggestFlats />

      {/* Flat Builder Modal */}
      {showFlatBuilder && (
        <FlatBuilder
          mode={builderMode}
          onSave={handleBuilderSave}
          onClose={() => setShowFlatBuilder(false)}
        />
      )}
    </div>
  )
}

function getDefaultColor(category) {
  switch (category) {
    case 'Wall': return '#D97706'
    case 'Window': return '#06B6D4'
    case 'Door': return '#10B981'
    case 'Other': return '#6B7280'
    default: return '#3B82F6'
  }
}

/**
 * Suggest Flats — analyses selected set and suggests flat combinations
 */
function SuggestFlats() {
  const { sets, selectedSetId, unit, addSet } = useStore()
  const selectedSet = sets.find(s => s.id === selectedSetId)
  const [suggestions, setSuggestions] = useState(null)

  if (!selectedSet || selectedSet.category !== 'Set') return null

  const handleSuggest = () => {
    const w = selectedSet.width
    const h = selectedSet.height
    const perimeter = 2 * (w + h)

    // Standard flat widths
    const flatWidths = [4, 3, 2, 1]

    // Greedy: fill each wall with largest flats first
    const walls = [
      { name: 'Front', length: w },
      { name: 'Back', length: w },
      { name: 'Left', length: h },
      { name: 'Right', length: h },
    ]

    const breakdown = walls.map(wall => {
      let remaining = wall.length
      const flats = []
      for (const fw of flatWidths) {
        while (remaining >= fw - 0.01) {
          flats.push(fw)
          remaining -= fw
        }
      }
      // If small remainder, note it
      return {
        ...wall,
        flats,
        remainder: Math.round(remaining * 100) / 100,
      }
    })

    const totalFlats = breakdown.reduce((sum, w) => sum + w.flats.length, 0)
    const totalLinear = breakdown.reduce((sum, w) => sum + w.flats.reduce((a, b) => a + b, 0), 0)

    setSuggestions({ breakdown, totalFlats, totalLinear, perimeter, setHeight: 8 })
  }

  const handleAddSuggestedFlats = () => {
    if (!suggestions) return
    const flatSets = []
    for (const wall of suggestions.breakdown) {
      for (let i = 0; i < wall.flats.length; i++) {
        flatSets.push({
          name: `${selectedSet.name} - ${wall.name} Flat ${i + 1}`,
          width: wall.flats[i],
          height: suggestions.setHeight,
          color: '#D97706',
          category: 'Wall',
          noCut: true,
          iconType: 'flat',
          thickness: 0.292,
          wallGap: 1,
        })
      }
    }
    // Use bulkAddSets from store
    const { bulkAddSets } = useStore.getState()
    bulkAddSets(flatSets)
    setSuggestions(null)
  }

  return (
    <div className="border border-gray-700 rounded p-2 mt-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-gray-300 font-medium">Suggest Flats</span>
        <span className="text-[10px] text-gray-500">
          Selected: {selectedSet.name} ({selectedSet.width}×{selectedSet.height})
        </span>
      </div>

      <button
        onClick={handleSuggest}
        className="w-full px-2 py-1.5 bg-amber-700 hover:bg-amber-600 text-white text-[11px] rounded transition-colors mb-2"
      >
        Calculate Flat Layout
      </button>

      {suggestions && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] text-gray-400">
            Perimeter: {suggestions.perimeter} {unit} · {suggestions.totalFlats} flats needed
          </div>
          {suggestions.breakdown.map((wall, i) => (
            <div key={i} className="bg-gray-900/50 rounded px-2 py-1">
              <span className="text-[10px] text-amber-400 font-medium">{wall.name}</span>
              <span className="text-[10px] text-gray-500 ml-1">({wall.length} {unit})</span>
              <div className="text-[10px] text-gray-300 mt-0.5">
                {wall.flats.map((f, j) => (
                  <span key={j} className="inline-block bg-amber-800/50 px-1 rounded mr-0.5 mb-0.5">
                    {f}'
                  </span>
                ))}
                {wall.remainder > 0.01 && (
                  <span className="text-red-400 ml-1">+{wall.remainder}' gap</span>
                )}
              </div>
            </div>
          ))}

          {/* Height selector */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-gray-400">Height:</span>
            {[8, 10, 12].map(h => (
              <button
                key={h}
                onClick={() => setSuggestions(s => ({ ...s, setHeight: h }))}
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  suggestions.setHeight === h
                    ? 'bg-amber-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {h}'
              </button>
            ))}
          </div>

          <button
            onClick={handleAddSuggestedFlats}
            className="w-full px-2 py-1.5 bg-green-700 hover:bg-green-600 text-white text-[11px] rounded transition-colors mt-1"
          >
            Add All {suggestions.totalFlats} Flats to Canvas
          </button>
        </div>
      )}
    </div>
  )
}
