import { useState } from 'react'

const FLAT_WIDTH_PRESETS = [1, 2, 3, 4]
const FLAT_HEIGHT_PRESETS = [8, 10, 12]
const WINDOW_WIDTH_PRESETS = [2, 3, 4, 6, 8, 12]
const WINDOW_HEIGHT_PRESETS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const DOOR_WIDTH_PRESETS = [3, 3.5, 4, 6, 8]
const DOOR_HEIGHT_PRESETS = [7, 8, 10]

export default function FlatBuilder({ mode, onSave, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-[480px] max-h-[85vh] overflow-y-auto border border-gray-700">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <h2 className="text-sm font-bold text-white">
            {mode === 'flat' ? 'Build Custom Flat' : mode === 'window' ? 'Build Custom Window' : 'Build Custom Door'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="p-5">
          {mode === 'flat' && <FlatForm onSave={onSave} />}
          {mode === 'window' && <WindowForm onSave={onSave} />}
          {mode === 'door' && <DoorForm onSave={onSave} />}
        </div>
      </div>
    </div>
  )
}

function FlatForm({ onSave }) {
  const [width, setWidth] = useState(4)
  const [height, setHeight] = useState(8)
  const [style, setStyle] = useState('hollywood')
  const [sides, setSides] = useState('single')
  const [name, setName] = useState('')

  const thickness = sides === 'braced' ? 2.583 : sides === 'double' ? 0.333 : 0.292
  const iconType = sides === 'braced' ? 'flat-braced' : sides === 'double' ? 'flat-double' : 'flat'

  // Lumber estimate
  const rails = 2 // top + bottom
  const stiles = 2 // left + right
  const toggleCount = Math.max(0, Math.floor((height - 1) / 2.5))
  const totalPieces = rails + stiles + toggleCount
  const lumberFt = (width * rails) + (height * stiles) + (width * toggleCount)
  const luanSheets = Math.ceil((width * height) / 32) * (sides === 'double' ? 2 : 1)

  const autoName = `${width}'×${height}' ${sides === 'braced' ? 'Braced Access' : sides === 'double' ? 'Double' : style === 'hollywood' ? 'Hollywood' : 'Broadway'} Flat`

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      category: 'Wall',
      subcategory: sides === 'braced' ? 'Braced Access' : sides === 'double' ? 'Double Flat' : style === 'hollywood' ? 'Hollywood Flat' : 'Broadway Flat',
      name: name || autoName,
      width,
      height,
      thickness,
      icon_type: iconType,
      properties: {
        style,
        sides,
        toggles: toggleCount,
        lumberPieces: totalPieces,
        lumberFt: Math.round(lumberFt),
        luanSheets,
      },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Name */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Name (optional)</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={autoName}
          className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Style */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Flat Style</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStyle('hollywood')}
            className={`flex-1 px-3 py-2 rounded text-xs transition-colors ${
              style === 'hollywood' ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Hollywood (Hard)
            <span className="block text-[9px] mt-0.5 opacity-70">1×3 on edge + luan</span>
          </button>
          <button
            type="button"
            onClick={() => setStyle('broadway')}
            className={`flex-1 px-3 py-2 rounded text-xs transition-colors ${
              style === 'broadway' ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Broadway (Soft)
            <span className="block text-[9px] mt-0.5 opacity-70">1×3 flat + muslin</span>
          </button>
        </div>
      </div>

      {/* Width */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Width (ft)</label>
        <div className="flex gap-1.5 mb-1.5">
          {FLAT_WIDTH_PRESETS.map(w => (
            <button
              key={w}
              type="button"
              onClick={() => setWidth(w)}
              className={`flex-1 px-2 py-1 rounded text-xs ${
                width === w ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {w}'
            </button>
          ))}
        </div>
        <input
          type="number"
          value={width}
          onChange={e => setWidth(parseFloat(e.target.value) || 0)}
          min="0.5"
          max="20"
          step="0.5"
          className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Height */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Height (ft)</label>
        <div className="flex gap-1.5 mb-1.5">
          {FLAT_HEIGHT_PRESETS.map(h => (
            <button
              key={h}
              type="button"
              onClick={() => setHeight(h)}
              className={`flex-1 px-2 py-1 rounded text-xs ${
                height === h ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {h}'
            </button>
          ))}
        </div>
        <input
          type="number"
          value={height}
          onChange={e => setHeight(parseFloat(e.target.value) || 0)}
          min="1"
          max="30"
          step="1"
          className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Sides */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Construction</label>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setSides('single')}
            className={`flex-1 px-2 py-2 rounded text-xs ${
              sides === 'single' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Single
            <span className="block text-[9px] mt-0.5 opacity-70">3.5" thick</span>
          </button>
          <button
            type="button"
            onClick={() => setSides('double')}
            className={`flex-1 px-2 py-2 rounded text-xs ${
              sides === 'double' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Double
            <span className="block text-[9px] mt-0.5 opacity-70">4" thick</span>
          </button>
          <button
            type="button"
            onClick={() => setSides('braced')}
            className={`flex-1 px-2 py-2 rounded text-xs ${
              sides === 'braced' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Braced
            <span className="block text-[9px] mt-0.5 opacity-70">2' gap access</span>
          </button>
        </div>
      </div>

      {/* Material estimate */}
      <div className="bg-gray-900/70 rounded p-3 border border-gray-700">
        <h4 className="text-[11px] text-gray-300 font-medium mb-2">Material Estimate</h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
          <span className="text-gray-500">Thickness:</span>
          <span className="text-white">{thickness}' ({Math.round(thickness * 12)}")</span>
          <span className="text-gray-500">1×3 Lumber:</span>
          <span className="text-white">{totalPieces} pieces (~{Math.round(lumberFt)} lin. ft)</span>
          <span className="text-gray-500">Toggles:</span>
          <span className="text-white">{toggleCount} (every ~2.5')</span>
          <span className="text-gray-500">Luan Sheets:</span>
          <span className="text-white">{luanSheets} × 4'×8' sheet{luanSheets > 1 ? 's' : ''}</span>
        </div>
      </div>

      <button
        type="submit"
        className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors font-medium"
      >
        Save to Library & Add to Canvas
      </button>
    </form>
  )
}

function WindowForm({ onSave }) {
  const [width, setWidth] = useState(4)
  const [height, setHeight] = useState(4)
  const [panes, setPanes] = useState(1)
  const [dividerWidth, setDividerWidth] = useState(0.333) // 4 inches
  const [surroundWidth, setSurroundWidth] = useState(0.333)
  const [name, setName] = useState('')

  const autoName = panes > 1
    ? `${width}' ${panes}-Pane Window`
    : `${width}'×${height}' Window`

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      category: 'Window',
      subcategory: panes > 1 ? 'Multi Pane' : 'Single Pane',
      name: name || autoName,
      width,
      height,
      thickness: 0.292,
      icon_type: 'window',
      properties: { panes, divider: panes > 1 ? dividerWidth : 0, surround: surroundWidth },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Name (optional)</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={autoName}
          className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Width */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Width (ft)</label>
        <div className="flex gap-1 flex-wrap mb-1.5">
          {WINDOW_WIDTH_PRESETS.map(w => (
            <button
              key={w}
              type="button"
              onClick={() => setWidth(w)}
              className={`px-2 py-1 rounded text-xs ${
                width === w ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {w}'
            </button>
          ))}
        </div>
        <input
          type="number"
          value={width}
          onChange={e => setWidth(parseFloat(e.target.value) || 0)}
          min="1"
          max="20"
          step="0.5"
          className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Height */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Height (ft)</label>
        <div className="flex gap-1 flex-wrap mb-1.5">
          {WINDOW_HEIGHT_PRESETS.map(h => (
            <button
              key={h}
              type="button"
              onClick={() => setHeight(h)}
              className={`px-2 py-1 rounded text-xs ${
                height === h ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {h}'
            </button>
          ))}
        </div>
        <input
          type="number"
          value={height}
          onChange={e => setHeight(parseFloat(e.target.value) || 0)}
          min="1"
          max="20"
          step="0.5"
          className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Panes */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Number of Panes</label>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPanes(p)}
              className={`flex-1 px-2 py-1.5 rounded text-xs ${
                panes === p ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Divider / Surround widths */}
      {panes > 1 && (
        <div>
          <label className="text-[11px] text-gray-400 block mb-1">Centre Divider</label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setDividerWidth(0.25)}
              className={`flex-1 px-2 py-1 rounded text-xs ${
                dividerWidth === 0.25 ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              3"
            </button>
            <button
              type="button"
              onClick={() => setDividerWidth(0.333)}
              className={`flex-1 px-2 py-1 rounded text-xs ${
                dividerWidth === 0.333 ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              4"
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Surround Width</label>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setSurroundWidth(0.25)}
            className={`flex-1 px-2 py-1 rounded text-xs ${
              surroundWidth === 0.25 ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            3"
          </button>
          <button
            type="button"
            onClick={() => setSurroundWidth(0.333)}
            className={`flex-1 px-2 py-1 rounded text-xs ${
              surroundWidth === 0.333 ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            4"
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-gray-900/70 rounded p-3 border border-gray-700">
        <h4 className="text-[11px] text-gray-300 font-medium mb-2">Preview</h4>
        <WindowPreview width={width} height={height} panes={panes} dividerWidth={dividerWidth} surroundWidth={surroundWidth} />
      </div>

      <button
        type="submit"
        className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors font-medium"
      >
        Save to Library & Add to Canvas
      </button>
    </form>
  )
}

function WindowPreview({ width, height, panes, dividerWidth, surroundWidth }) {
  const maxW = 200
  const maxH = 120
  const scale = Math.min(maxW / width, maxH / height)
  const w = width * scale
  const h = height * scale
  const pad = surroundWidth * scale
  const divW = dividerWidth * scale

  return (
    <svg width={w + 10} height={h + 10} viewBox={`0 0 ${w + 10} ${h + 10}`}>
      {/* Outer frame */}
      <rect x="5" y="5" width={w} height={h} fill="none" stroke="#06B6D4" strokeWidth="1.5" />
      {/* Inner opening */}
      <rect x={5 + pad} y={5 + pad} width={w - pad * 2} height={h - pad * 2} fill="rgba(135,206,235,0.15)" stroke="#06B6D4" strokeWidth="0.8" />
      {/* Dividers */}
      {panes > 1 && Array.from({ length: panes - 1 }, (_, i) => {
        const dx = 5 + pad + ((w - pad * 2) / panes) * (i + 1)
        return <rect key={i} x={dx - divW / 2} y={5 + pad} width={divW} height={h - pad * 2} fill="#06B6D4" opacity="0.5" />
      })}
      {/* Cross lines for single pane */}
      {panes === 1 && (
        <>
          <line x1={5 + pad} y1={5 + pad} x2={5 + w - pad} y2={5 + h - pad} stroke="rgba(135,206,235,0.3)" strokeWidth="0.5" />
          <line x1={5 + w - pad} y1={5 + pad} x2={5 + pad} y2={5 + h - pad} stroke="rgba(135,206,235,0.3)" strokeWidth="0.5" />
        </>
      )}
    </svg>
  )
}

function DoorForm({ onSave }) {
  const [width, setWidth] = useState(3)
  const [height, setHeight] = useState(8)
  const [style, setStyle] = useState('single') // single, double, arch
  const [swing, setSwing] = useState('left')
  const [name, setName] = useState('')

  const iconType = style === 'double' ? 'door-double' : style === 'arch' ? 'door-arch' : 'door'
  const autoName = style === 'double'
    ? `${width}'×${height}' Double Door`
    : style === 'arch'
    ? `${width}'×${height}' Arch Door`
    : `${width}'×${height}' Door`

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      category: 'Door',
      subcategory: style === 'double' ? 'Double Door' : style === 'arch' ? 'Arch' : 'Single Door',
      name: name || autoName,
      width,
      height,
      thickness: 0.292,
      icon_type: iconType,
      properties: { style, swing: style === 'double' ? 'both' : swing || 'left' },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Name (optional)</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={autoName}
          className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Style */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Door Type</label>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setStyle('single')}
            className={`flex-1 px-2 py-2 rounded text-xs ${
              style === 'single' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Single
          </button>
          <button
            type="button"
            onClick={() => setStyle('double')}
            className={`flex-1 px-2 py-2 rounded text-xs ${
              style === 'double' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Double
          </button>
          <button
            type="button"
            onClick={() => setStyle('arch')}
            className={`flex-1 px-2 py-2 rounded text-xs ${
              style === 'arch' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Arch
          </button>
        </div>
      </div>

      {/* Width */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Width (ft)</label>
        <div className="flex gap-1 flex-wrap mb-1.5">
          {DOOR_WIDTH_PRESETS.map(w => (
            <button
              key={w}
              type="button"
              onClick={() => setWidth(w)}
              className={`px-2 py-1 rounded text-xs ${
                width === w ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {w}'
            </button>
          ))}
        </div>
        <input
          type="number"
          value={width}
          onChange={e => setWidth(parseFloat(e.target.value) || 0)}
          min="1"
          max="20"
          step="0.5"
          className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Height */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Height (ft)</label>
        <div className="flex gap-1.5 mb-1.5">
          {DOOR_HEIGHT_PRESETS.map(h => (
            <button
              key={h}
              type="button"
              onClick={() => setHeight(h)}
              className={`flex-1 px-2 py-1 rounded text-xs ${
                height === h ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {h}'
            </button>
          ))}
        </div>
        <input
          type="number"
          value={height}
          onChange={e => setHeight(parseFloat(e.target.value) || 0)}
          min="1"
          max="20"
          step="0.5"
          className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Swing direction (single + arch doors) */}
      {(style === 'single' || style === 'arch') && (
        <div>
          <label className="text-[11px] text-gray-400 block mb-1">Swing Direction</label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setSwing('left')}
              className={`flex-1 px-2 py-1.5 rounded text-xs ${
                swing === 'left' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              Left
            </button>
            <button
              type="button"
              onClick={() => setSwing('right')}
              className={`flex-1 px-2 py-1.5 rounded text-xs ${
                swing === 'right' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              Right
            </button>
            <button
              type="button"
              onClick={() => setSwing('both')}
              className={`flex-1 px-2 py-1.5 rounded text-xs ${
                swing === 'both' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              Both
            </button>
          </div>
        </div>
      )}

      <button
        type="submit"
        className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors font-medium"
      >
        Save to Library & Add to Canvas
      </button>
    </form>
  )
}
