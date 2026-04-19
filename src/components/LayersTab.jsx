import { useState, memo } from 'react'
import useStore from '../store.js'

const CATEGORY_ICONS = {
  Set: '📦',
  Wall: '🧱',
  Window: '🪟',
  Door: '🚪',
  Furniture: '🪑',
  Kitchen: '🍳',
  Bathroom: '🚿',
  Column: '🏛',
  Stair: '🪜',
  Fireplace: '🔥',
  Other: '📐',
}

const CATEGORY_COLORS = {
  Set: '#3B82F6',
  Wall: '#D97706',
  Window: '#06B6D4',
  Door: '#10B981',
  Furniture: '#8B5CF6',
  Kitchen: '#F97316',
  Bathroom: '#06B6D4',
  Other: '#6B7280',
}

export default memo(function LayersTab() {
  const {
    sets, groups, annotations,
    layerVisibility, toggleLayerVisibility,
    hideSet, showSet, deleteGroup, updateGroup,
    addGroup, selectedSetId, setSelectedSetId,
    updateAnnotation, deleteAnnotation, addAnnotation,
    showDimensions, setShowDimensions,
    dimMode, setDimMode,
    showClearance, setShowClearance,
    labelsVisible, setLabelsVisible,
    labelFontSize, setLabelFontSize,
    labelColor, setLabelColor,
    showOverlaps, setShowOverlaps,
    gridVisible, setGridVisible,
    showHoverTooltips, setShowHoverTooltips,
    unit, pixelsPerUnit,
    buildingWalls, buildingWallsVisible, setBuildingWallsVisible,
    showLockIndicators, setShowLockIndicators,
    hideAllSets, setHideAllSets,
    pdfLayers, activePdfLayerId, setActivePdfLayer,
    togglePdfLayerVisibility, setPdfLayerOpacity,
    renamePdfLayer, removePdfLayer, updatePdfLayer,
    lockPdfToSet, unlockPdfFromSet, setPdfLayerZOrder,
  } = useStore()

  const [newGroupName, setNewGroupName] = useState('')
  const [editingAnnotation, setEditingAnnotation] = useState(null)
  const [annotationText, setAnnotationText] = useState('')
  const [editingPdfName, setEditingPdfName] = useState(null)
  const [pdfNameInput, setPdfNameInput] = useState('')
  const [scalingPdfId, setScalingPdfId] = useState(null)
  const [scaleDimInput, setScaleDimInput] = useState('')

  // Collect unique categories from sets
  const visibleSets = sets.filter(s => s.onPlan !== false)
  const categories = [...new Set(visibleSets.map(s => s.category || 'Set'))].sort()

  const getCategoryCounts = (cat) => visibleSets.filter(s => (s.category || 'Set') === cat).length
  const isVisible = (cat) => layerVisibility[cat] !== false

  // Group display — defensive guard in case a legacy group slips through without setIds
  const ungroupedSets = visibleSets.filter(s =>
    !groups.some(g => (g.setIds || []).includes(s.id))
  )

  return (
    <div className="p-3 flex flex-col gap-3">
      <h3 className="text-sm font-bold text-white">Layers & Visibility</h3>

      {/* Global toggles */}
      <div className="flex flex-col gap-1 bg-gray-900/50 rounded p-2 border border-gray-700">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Display Options</span>
        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-red-900/30 rounded px-1 py-0.5">
          <input type="checkbox" checked={hideAllSets} onChange={e => setHideAllSets(e.target.checked)} className="accent-red-500" />
          <span className={hideAllSets ? 'text-red-400 font-medium' : 'text-gray-300'}>Hide All Sets</span>
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-700/50 rounded px-1 py-0.5">
          <input type="checkbox" checked={gridVisible} onChange={e => setGridVisible(e.target.checked)} className="accent-indigo-500" />
          <span className="text-gray-300">Grid</span>
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-700/50 rounded px-1 py-0.5">
          <input type="checkbox" checked={labelsVisible} onChange={e => setLabelsVisible(e.target.checked)} className="accent-indigo-500" />
          <span className="text-gray-300">Labels</span>
        </label>
        {labelsVisible && (
          <div className="flex items-center gap-2 pl-5 py-0.5">
            <span className="text-[10px] text-gray-500 shrink-0">Size:</span>
            <select
              value={labelFontSize}
              onChange={e => setLabelFontSize(Number(e.target.value))}
              className="text-[10px] bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white"
            >
              <option value={0}>Auto</option>
              <option value={8}>8px</option>
              <option value={10}>10px</option>
              <option value={12}>12px</option>
              <option value={14}>14px</option>
              <option value={16}>16px</option>
              <option value={18}>18px</option>
              <option value={20}>20px</option>
              <option value={24}>24px</option>
            </select>
            <span className="text-[10px] text-gray-500 shrink-0">Color:</span>
            <input
              type="color"
              value={labelColor}
              onChange={e => setLabelColor(e.target.value)}
              className="w-5 h-5 rounded border-0 cursor-pointer bg-transparent"
            />
          </div>
        )}
        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-700/50 rounded px-1 py-0.5">
          <input type="checkbox" checked={showOverlaps} onChange={e => setShowOverlaps(e.target.checked)} className="accent-indigo-500" />
          <span className="text-gray-300">Overlap Zones</span>
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-700/50 rounded px-1 py-0.5">
          <input type="checkbox" checked={showDimensions} onChange={e => setShowDimensions(e.target.checked)} className="accent-indigo-500" />
          <span className="text-gray-300">Dimension Lines</span>
        </label>
        {showDimensions && (
          <div className="flex items-center gap-1 pl-5 py-0.5">
            <span className="text-[10px] text-gray-500 shrink-0">Mode:</span>
            <button onClick={() => setDimMode('selected')}
              className={`text-[10px] px-1.5 py-0.5 rounded ${dimMode === 'selected' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
              Selected
            </button>
            <button onClick={() => setDimMode('all')}
              className={`text-[10px] px-1.5 py-0.5 rounded ${dimMode === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
              All
            </button>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-700/50 rounded px-1 py-0.5">
          <input type="checkbox" checked={showClearance} onChange={e => setShowClearance(e.target.checked)} className="accent-cyan-500" />
          <span className="text-gray-300">Clearance Zones</span>
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-700/50 rounded px-1 py-0.5">
          <input type="checkbox" checked={showHoverTooltips} onChange={e => setShowHoverTooltips(e.target.checked)} className="accent-indigo-500" />
          <span className="text-gray-300">Hover Tooltips</span>
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-700/50 rounded px-1 py-0.5">
          <input type="checkbox" checked={showLockIndicators} onChange={e => setShowLockIndicators(e.target.checked)} className="accent-indigo-500" />
          <span className="text-gray-300">Lock Indicators</span>
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-700/50 rounded px-1 py-0.5">
          <input type="checkbox" checked={buildingWallsVisible} onChange={e => setBuildingWallsVisible(e.target.checked)} className="accent-amber-500" />
          <span className="text-amber-400">Building Walls</span>
          <span className="text-[10px] text-gray-500">({buildingWalls.length})</span>
        </label>
      </div>

      {/* PDF Layers */}
      {pdfLayers.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">PDF Layers</span>
          {pdfLayers.map(layer => (
            <div
              key={layer.id}
              className={`bg-gray-800/50 rounded border overflow-hidden ${
                layer.id === activePdfLayerId ? 'border-indigo-500' : 'border-gray-700'
              }`}
            >
              <div className="flex items-center gap-2 px-2 py-1.5">
                {/* Visibility toggle */}
                <button
                  onClick={() => togglePdfLayerVisibility(layer.id)}
                  className={`text-xs ${layer.visible ? 'text-green-400' : 'text-gray-600'}`}
                  title={layer.visible ? 'Hide' : 'Show'}
                >
                  {layer.visible ? '\u{1F441}' : '\u{1F441}\u200D\u{1F5E8}'}
                </button>

                {/* Name — click to edit */}
                {editingPdfName === layer.id ? (
                  <input
                    type="text"
                    value={pdfNameInput}
                    onChange={e => setPdfNameInput(e.target.value)}
                    onBlur={() => { renamePdfLayer(layer.id, pdfNameInput); setEditingPdfName(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') { renamePdfLayer(layer.id, pdfNameInput); setEditingPdfName(null) } }}
                    autoFocus
                    className="flex-1 px-1 py-0.5 bg-gray-900 border border-gray-600 rounded text-xs text-white focus:outline-none focus:border-indigo-500 min-w-0"
                  />
                ) : (
                  <span
                    className="text-xs text-white flex-1 truncate cursor-pointer"
                    onClick={() => { setEditingPdfName(layer.id); setPdfNameInput(layer.name) }}
                    title="Click to rename"
                  >
                    {layer.name}
                  </span>
                )}

                {/* Active indicator / select */}
                <button
                  onClick={() => setActivePdfLayer(layer.id)}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    layer.id === activePdfLayerId
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                  title="Set as active PDF"
                >
                  {layer.id === activePdfLayerId ? 'Active' : 'Select'}
                </button>

                {/* Remove */}
                <button
                  onClick={() => { if (confirm(`Remove "${layer.name}" PDF layer?`)) removePdfLayer(layer.id) }}
                  className="text-[10px] text-red-400 hover:text-red-300"
                  title="Remove PDF layer"
                >
                  ✕
                </button>
              </div>

              {/* Opacity slider */}
              <div className="flex items-center gap-2 px-2 py-1 border-t border-gray-700/50">
                <span className="text-[10px] text-gray-500 w-10">Opacity</span>
                <input
                  type="range"
                  min="0" max="1" step="0.05"
                  value={layer.opacity}
                  onChange={e => setPdfLayerOpacity(layer.id, parseFloat(e.target.value))}
                  className="flex-1 h-1 accent-indigo-500"
                />
                <span className="text-[10px] text-gray-400 w-8 text-right">{Math.round(layer.opacity * 100)}%</span>
              </div>

              {/* Scale to dimension */}
              <div className="flex items-center gap-1 px-2 py-1 border-t border-gray-700/50">
                {scalingPdfId === layer.id ? (
                  <>
                    <input
                      type="number"
                      placeholder={`Width in ${unit}...`}
                      value={scaleDimInput}
                      onChange={e => setScaleDimInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const realWidth = parseFloat(scaleDimInput)
                          if (realWidth > 0 && layer.originalSize) {
                            const newScale = (realWidth * pixelsPerUnit) / layer.originalSize.width
                            updatePdfLayer(layer.id, { scale: newScale, scaleX: newScale, scaleY: newScale })
                          }
                          setScalingPdfId(null)
                          setScaleDimInput('')
                        }
                        if (e.key === 'Escape') { setScalingPdfId(null); setScaleDimInput('') }
                      }}
                      autoFocus
                      className="flex-1 px-1.5 py-0.5 bg-gray-900 border border-gray-600 rounded text-[10px] text-white focus:outline-none focus:border-indigo-500 min-w-0"
                    />
                    <button
                      onClick={() => {
                        const realWidth = parseFloat(scaleDimInput)
                        if (realWidth > 0 && layer.originalSize) {
                          const newScale = (realWidth * pixelsPerUnit) / layer.originalSize.width
                          updatePdfLayer(layer.id, { scale: newScale })
                        }
                        setScalingPdfId(null)
                        setScaleDimInput('')
                      }}
                      className="text-[10px] text-green-400 hover:text-green-300 px-1"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => { setScalingPdfId(null); setScaleDimInput('') }}
                      className="text-[10px] text-gray-400 hover:text-gray-300"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setScalingPdfId(layer.id)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300"
                  >
                    Scale to Dimension
                  </button>
                )}
                <span className="text-[10px] text-gray-600 ml-auto">
                  {(layer.scaleX && layer.scaleY && Math.abs(layer.scaleX - layer.scaleY) > 0.001)
                    ? `${Math.round((layer.scaleX || layer.scale) * 100)}×${Math.round((layer.scaleY || layer.scale) * 100)}%`
                    : `${Math.round((layer.scale || 1) * 100)}%`}
                </span>
              </div>

              {/* Pin to Set */}
              <div className="flex items-center gap-2 px-2 py-1 border-t border-gray-700/50">
                <span className="text-[10px] text-gray-500 w-10">Pin to</span>
                <select
                  value={layer.lockedToSetId || ''}
                  onChange={e => {
                    const setId = parseInt(e.target.value) || null
                    if (setId) lockPdfToSet(layer.id, setId)
                    else unlockPdfFromSet(layer.id)
                  }}
                  className="flex-1 bg-gray-900 border border-gray-600 rounded text-[10px] text-white px-1 py-0.5 focus:outline-none focus:border-indigo-500 min-w-0"
                >
                  <option value="">Free (not pinned)</option>
                  {sets.filter(s => s.onPlan !== false).map(s => (
                    <option key={s.id} value={s.id}>{s.name || `Set ${s.id}`}</option>
                  ))}
                </select>
              </div>

              {/* Flip + Z-order */}
              <div className="flex items-center gap-2 px-2 py-1 border-t border-gray-700/50">
                <span className="text-[10px] text-gray-500 w-10">Flip</span>
                <button
                  onClick={() => updatePdfLayer(layer.id, { flipX: !layer.flipX })}
                  className={`text-[10px] px-2 py-0.5 rounded ${layer.flipX ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                  title="Flip horizontal"
                >
                  ↔ H
                </button>
                <button
                  onClick={() => updatePdfLayer(layer.id, { flipY: !layer.flipY })}
                  className={`text-[10px] px-2 py-0.5 rounded ${layer.flipY ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                  title="Flip vertical"
                >
                  ↕ V
                </button>
                <button
                  onClick={() => setPdfLayerZOrder(layer.id, (layer.zOrder || 'back') === 'front' ? 'back' : 'front')}
                  className={`text-[10px] px-2 py-0.5 rounded ml-auto ${
                    (layer.zOrder || 'back') === 'front'
                      ? 'bg-amber-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {(layer.zOrder || 'back') === 'front' ? '⬆ Front' : '⬇ Back'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category layers */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Category Layers</span>
        {categories.map(cat => {
          const count = getCategoryCounts(cat)
          const visible = isVisible(cat)
          const hiddenCount = visibleSets.filter(s => (s.category || 'Set') === cat && s.hidden).length
          return (
            <div
              key={cat}
              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                visible ? 'hover:bg-gray-700/50' : 'bg-gray-800/50 opacity-50'
              }`}
              onClick={() => toggleLayerVisibility(cat)}
            >
              <span className="text-sm">{CATEGORY_ICONS[cat] || '📐'}</span>
              <div
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: CATEGORY_COLORS[cat] || '#6B7280' }}
              />
              <span className="text-xs text-white flex-1">{cat}</span>
              <span className="text-[10px] text-gray-500">{count}{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}</span>
              <span className={`text-xs ${visible ? 'text-green-400' : 'text-gray-600'}`}>
                {visible ? '👁' : '👁‍🗨'}
              </span>
            </div>
          )
        })}
        {categories.length === 0 && (
          <p className="text-gray-500 text-xs text-center py-2">No sets on plan</p>
        )}
      </div>

      {/* Groups */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Groups</span>
        {groups.map(g => {
          const memberSets = sets.filter(s => (g.setIds || []).includes(s.id))
          return (
            <div key={g.id} className="bg-gray-800/50 rounded border border-gray-700 overflow-hidden">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <button
                  onClick={() => updateGroup(g.id, { collapsed: !g.collapsed })}
                  className="text-xs text-gray-400"
                >
                  {g.collapsed ? '▸' : '▾'}
                </button>
                <span className="text-xs text-white flex-1 truncate">{g.name}</span>
                <span className="text-[10px] text-gray-500">{memberSets.length}</span>
                <button
                  onClick={() => deleteGroup(g.id)}
                  className="text-[10px] text-red-400 hover:text-red-300"
                  title="Ungroup"
                >
                  ✕
                </button>
              </div>
              {!g.collapsed && (
                <div className="border-t border-gray-700/50 px-1 py-1">
                  {memberSets.map(s => (
                    <div
                      key={s.id}
                      onClick={() => setSelectedSetId(s.id)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer ${
                        s.id === selectedSetId ? 'bg-gray-600' : 'hover:bg-gray-700/50'
                      }`}
                    >
                      <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
                      <span className="text-gray-300 truncate flex-1">{s.name}</span>
                      <span className="text-[9px] text-gray-500">{s.width}x{s.height}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); s.hidden ? showSet(s.id) : hideSet(s.id) }}
                        className={`text-[10px] ${s.hidden ? 'text-gray-600' : 'text-gray-400'}`}
                      >
                        {s.hidden ? '👁‍🗨' : '👁'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* Create new group */}
        <div className="flex gap-1 mt-1">
          <input
            type="text"
            placeholder="New group name..."
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            className="flex-1 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => {
              if (newGroupName.trim()) {
                addGroup(newGroupName.trim(), [])
                setNewGroupName('')
              }
            }}
            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-xs text-white"
          >
            +
          </button>
        </div>
        <p className="text-[9px] text-gray-600 italic">Select sets in Sets tab, then group them here</p>
      </div>

      {/* Annotations */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Annotations</span>
          <button
            onClick={() => addAnnotation({ text: 'New Label', x: 200, y: 200 })}
            className="text-[10px] text-indigo-400 hover:text-indigo-300"
          >
            + Add Label
          </button>
        </div>
        {annotations.map(a => (
          <div key={a.id} className="flex items-center gap-2 px-2 py-1 bg-gray-800/50 rounded hover:bg-gray-700/50">
            {editingAnnotation === a.id ? (
              <input
                type="text"
                value={annotationText}
                onChange={e => setAnnotationText(e.target.value)}
                onBlur={() => { updateAnnotation(a.id, { text: annotationText }); setEditingAnnotation(null) }}
                onKeyDown={e => { if (e.key === 'Enter') { updateAnnotation(a.id, { text: annotationText }); setEditingAnnotation(null) } }}
                autoFocus
                className="flex-1 px-1 py-0.5 bg-gray-900 border border-gray-600 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            ) : (
              <span
                className="text-xs text-white flex-1 truncate cursor-pointer"
                onClick={() => { setEditingAnnotation(a.id); setAnnotationText(a.text) }}
              >
                {a.text}
              </span>
            )}
            <select
              value={a.fontSize || 14}
              onChange={e => updateAnnotation(a.id, { fontSize: parseInt(e.target.value) })}
              className="text-[10px] bg-gray-700 border border-gray-600 rounded text-gray-300 px-0.5"
            >
              {[10, 12, 14, 16, 20, 24, 32].map(s => (
                <option key={s} value={s}>{s}px</option>
              ))}
            </select>
            <input
              type="color"
              value={a.color || '#ffffff'}
              onChange={e => updateAnnotation(a.id, { color: e.target.value })}
              className="w-5 h-5 rounded border-0 cursor-pointer bg-transparent"
            />
            <button
              onClick={() => deleteAnnotation(a.id)}
              className="text-[10px] text-red-400 hover:text-red-300"
            >
              ✕
            </button>
          </div>
        ))}
        {annotations.length === 0 && (
          <p className="text-gray-600 text-[10px] text-center py-1">No annotations yet</p>
        )}
      </div>

      {/* Area Calculation */}
      {visibleSets.length > 0 && (
        <div className="flex flex-col gap-1 bg-gray-900/50 rounded p-2 border border-gray-700">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Area Summary</span>
          {categories.map(cat => {
            const catSets = visibleSets.filter(s => (s.category || 'Set') === cat && !s.hidden)
            const totalArea = catSets.reduce((sum, s) => sum + s.width * s.height, 0)
            const totalLinearFt = catSets.reduce((sum, s) => sum + s.width, 0)
            return (
              <div key={cat} className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{cat}</span>
                <span className="text-white">
                  {catSets.length} pcs
                  {cat === 'Wall' || cat === 'Window' || cat === 'Door'
                    ? ` · ${Math.round(totalLinearFt)} lin.${unit}`
                    : ` · ${Math.round(totalArea)} sq.${unit}`
                  }
                </span>
              </div>
            )
          })}
          <div className="h-px bg-gray-700 my-1" />
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-gray-300">Total Sets</span>
            <span className="text-white">{visibleSets.filter(s => !s.hidden).length}</span>
          </div>
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-gray-300">Total Area</span>
            <span className="text-white">
              {Math.round(visibleSets.filter(s => !s.hidden).reduce((sum, s) => sum + s.width * s.height, 0))} sq.{unit}
            </span>
          </div>
          {/* Bounding box of all sets = floor plan footprint */}
          {(() => {
            const activeSets = visibleSets.filter(s => !s.hidden)
            if (activeSets.length === 0) return null
            const ppu = pixelsPerUnit
            const minX = Math.min(...activeSets.map(s => s.x)) / ppu
            const minY = Math.min(...activeSets.map(s => s.y)) / ppu
            const maxX = Math.max(...activeSets.map(s => {
              const isRot = (s.rotation || 0) % 180 !== 0
              return s.x + (isRot ? s.height : s.width) * ppu
            })) / ppu
            const maxY = Math.max(...activeSets.map(s => {
              const isRot = (s.rotation || 0) % 180 !== 0
              return s.y + (isRot ? s.width : s.height) * ppu
            })) / ppu
            const bboxW = Math.round((maxX - minX) * 10) / 10
            const bboxH = Math.round((maxY - minY) * 10) / 10
            return (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Bounding Box</span>
                <span className="text-gray-300">{bboxW} x {bboxH} {unit}</span>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
})
