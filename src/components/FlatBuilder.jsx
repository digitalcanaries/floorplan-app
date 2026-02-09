import { useState } from 'react'

const WINDOW_DEPTH_PRESETS = [
  { value: 3, label: '3"' },
  { value: 4, label: '4"' },
  { value: 6, label: '6"' },
  { value: 12, label: '12"' },
  { value: 18, label: '18"' },
  { value: 24, label: '24"' },
  { value: 36, label: '36"' },
]
const FLAT_WIDTH_PRESETS = [1, 2, 3, 4, 5, 6]
const FLAT_HEIGHT_PRESETS = [8, 10, 12, 14, 16]
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
  const [height, setHeight] = useState(12)
  const [style, setStyle] = useState('hollywood')
  const [sides, setSides] = useState('single')
  const [name, setName] = useState('')

  // Standard construction: 1×3 timber (0.75" × 2.5" actual, ~3.5" on edge for Hollywood)
  // Rails: 2' standard (top + bottom), stiles run full height
  // Hollywood flat: 1×3 on edge + luan = 3.5" thick ≈ 0.292'
  // Broadway flat: 1×3 flat + muslin = 0.75" thick
  const thickness = sides === 'braced' ? 2.583 : sides === 'double' ? 0.333 : 0.292
  const iconType = sides === 'braced' ? 'flat-braced' : sides === 'double' ? 'flat-double' : 'flat'

  // Lumber estimate — standard flat construction with 2' rails and 1×3 timber
  const railHeight = 2 // standard 2' rail width
  const rails = 2 // top + bottom rail
  const stiles = 2 // left + right stile
  const toggleCount = Math.max(0, Math.floor((height - railHeight * 2) / 2.5))
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
      height: thickness, // plan-view: height of the set IS the depth/thickness (thin line from above)
      thickness,
      wallHeight: height, // actual elevation height (e.g. 12ft)
      icon_type: iconType,
      properties: {
        style,
        sides,
        railHeight: railHeight,
        timber: '1x3',
        toggles: toggleCount,
        lumberPieces: totalPieces,
        lumberFt: Math.round(lumberFt),
        luanSheets,
        flatWidth: width,
        flatHeight: height, // elevation height
        elevationHeight: height, // consistent with door/window property naming
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
          <span className="text-gray-500">Flat Size:</span>
          <span className="text-white">{width}' × {height}' ({width * height} sq ft)</span>
          <span className="text-gray-500">Thickness:</span>
          <span className="text-white">{thickness}' ({Math.round(thickness * 12)}")</span>
          <span className="text-gray-500">Rails:</span>
          <span className="text-white">2 × {width}' (2' standard rail)</span>
          <span className="text-gray-500">Stiles:</span>
          <span className="text-white">2 × {height}' (1×3 {style === 'hollywood' ? 'on edge' : 'flat'})</span>
          <span className="text-gray-500">1×3 Lumber:</span>
          <span className="text-white">{totalPieces} pieces (~{Math.round(lumberFt)} lin. ft)</span>
          <span className="text-gray-500">Toggles:</span>
          <span className="text-white">{toggleCount} (every ~2.5')</span>
          <span className="text-gray-500">{style === 'hollywood' ? 'Luan Sheets' : 'Muslin'}:</span>
          <span className="text-white">{style === 'hollywood' ? `${luanSheets} × 4'×8' sheet${luanSheets > 1 ? 's' : ''}` : `${Math.ceil(width * height / 30)} yard${Math.ceil(width * height / 30) > 1 ? 's' : ''}`}</span>
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
  const [depthInches, setDepthInches] = useState(6) // wall depth in inches for plan view
  const [panes, setPanes] = useState(1)
  const [dividerWidth, setDividerWidth] = useState(0.333) // 4 inches
  const [surroundWidth, setSurroundWidth] = useState(0.333)
  const [windowStyle, setWindowStyle] = useState('standard') // standard, bay
  const [bayAngle, setBayAngle] = useState(30) // bay window angle in degrees
  const [baySections, setBaySections] = useState(3) // bay window section count
  const [name, setName] = useState('')

  const depthFt = depthInches / 12 // convert to feet for saving
  const iconType = windowStyle === 'bay' ? 'window-bay' : 'window'
  const autoName = windowStyle === 'bay'
    ? `${width}' ${baySections}-Section Bay Window`
    : panes > 1
    ? `${width}' ${panes}-Pane Window`
    : `${width}'×${height}' Window`

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      category: 'Window',
      subcategory: windowStyle === 'bay' ? 'Bay Window' : panes > 1 ? 'Multi Pane' : 'Single Pane',
      name: name || autoName,
      width,
      height: depthFt, // plan-view: height of the set IS the depth (projection from wall, in feet)
      thickness: 0.292,
      icon_type: iconType,
      properties: {
        panes,
        divider: panes > 1 ? dividerWidth : 0,
        surround: surroundWidth,
        elevationHeight: height, // store full elevation height for reference
        depth: depthFt,
        ...(windowStyle === 'bay' ? { bayAngle, baySections } : {}),
      },
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

      {/* Window Style */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Window Type</label>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setWindowStyle('standard')}
            className={`flex-1 px-2 py-2 rounded text-xs ${
              windowStyle === 'standard' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Standard
            <span className="block text-[9px] mt-0.5 opacity-70">Flat window</span>
          </button>
          <button
            type="button"
            onClick={() => setWindowStyle('bay')}
            className={`flex-1 px-2 py-2 rounded text-xs ${
              windowStyle === 'bay' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Bay Window
            <span className="block text-[9px] mt-0.5 opacity-70">Projects outward</span>
          </button>
        </div>
      </div>

      {/* Width */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Width (ft) — along wall face</label>
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

      {/* Height (elevation) */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Height (ft) — elevation / face view</label>
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

      {/* Depth (plan view projection) — in inches */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">
          Depth (inches) — {windowStyle === 'bay' ? 'bay projection from wall' : 'frame depth / wall thickness on plan'}
        </label>
        <div className="flex gap-1 flex-wrap mb-1.5">
          {WINDOW_DEPTH_PRESETS.map(d => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDepthInches(d.value)}
              className={`px-2 py-1 rounded text-xs ${
                depthInches === d.value ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <input
          type="number"
          value={depthInches}
          onChange={e => setDepthInches(parseFloat(e.target.value) || 0)}
          min="2"
          max="72"
          step="1"
          className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
        />
        <span className="text-[9px] text-gray-500 mt-0.5 block">
          {windowStyle === 'bay' ? 'Bay windows typically project 12"–36"' : 'Standard windows: 4"–6" deep'}
        </span>
      </div>

      {/* Bay window specific settings */}
      {windowStyle === 'bay' && (
        <>
          <div>
            <label className="text-[11px] text-gray-400 block mb-1">Bay Angle</label>
            <div className="flex gap-1.5">
              {[30, 45, 60].map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setBayAngle(a)}
                  className={`flex-1 px-2 py-1.5 rounded text-xs ${
                    bayAngle === a ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {a}°
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-400 block mb-1">Sections</label>
            <div className="flex gap-1.5">
              {[3, 5].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setBaySections(s)}
                  className={`flex-1 px-2 py-1.5 rounded text-xs ${
                    baySections === s ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {s} Section{s > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Panes (standard windows only) */}
      {windowStyle === 'standard' && (
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
      )}

      {/* Divider / Surround widths (standard only) */}
      {windowStyle === 'standard' && panes > 1 && (
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

      {windowStyle === 'standard' && (
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
      )}

      {/* Preview */}
      <div className="bg-gray-900/70 rounded p-3 border border-gray-700">
        <h4 className="text-[11px] text-gray-300 font-medium mb-2">Preview</h4>
        {windowStyle === 'bay' ? (
          <BayWindowPreview width={width} depth={depthFt} bayAngle={bayAngle} baySections={baySections} />
        ) : (
          <WindowPreview width={width} height={height} panes={panes} dividerWidth={dividerWidth} surroundWidth={surroundWidth} />
        )}
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

function BayWindowPreview({ width, depth, bayAngle, baySections }) {
  const maxW = 220
  const maxH = 140
  const scale = Math.min(maxW / width, maxH / (depth + 0.5))
  const w = width * scale
  const d = depth * scale
  const pad = 10

  // Bay geometry: centre section is flat, side sections angle outward
  const angleRad = (bayAngle * Math.PI) / 180
  const sideWidth = w * 0.25
  const centreWidth = w - sideWidth * 2
  const sideDepth = Math.min(d, sideWidth * Math.sin(angleRad))

  // Points: wall line at top, bay projects downward
  const wallY = pad
  const points = [
    `${pad},${wallY}`, // wall left
    `${pad + sideWidth * Math.cos(angleRad)},${wallY + sideDepth}`, // left side end
  ]
  if (baySections >= 3) {
    points.push(`${pad + sideWidth * Math.cos(angleRad) + centreWidth},${wallY + sideDepth}`) // centre right
  }
  points.push(`${pad + w},${wallY}`) // wall right

  return (
    <svg width={w + pad * 2} height={d + pad * 2} viewBox={`0 0 ${w + pad * 2} ${d + pad * 2}`}>
      {/* Wall line */}
      <line x1={pad} y1={wallY} x2={pad + w} y2={wallY} stroke="#06B6D4" strokeWidth="2" />
      {/* Bay outline */}
      <polyline points={points.join(' ')} fill="rgba(135,206,235,0.1)" stroke="#06B6D4" strokeWidth="1.5" />
      {/* Glass lines for each section */}
      {baySections >= 3 && (
        <>
          {/* Left glass */}
          <line x1={pad + 2} y1={wallY + 2} x2={pad + sideWidth * Math.cos(angleRad) - 2} y2={wallY + sideDepth - 2} stroke="rgba(135,206,235,0.4)" strokeWidth="0.8" />
          {/* Centre glass */}
          <line x1={pad + sideWidth * Math.cos(angleRad) + 2} y1={wallY + sideDepth} x2={pad + sideWidth * Math.cos(angleRad) + centreWidth - 2} y2={wallY + sideDepth} stroke="rgba(135,206,235,0.4)" strokeWidth="0.8" />
          {/* Right glass */}
          <line x1={pad + sideWidth * Math.cos(angleRad) + centreWidth + 2} y1={wallY + sideDepth - 2} x2={pad + w - 2} y2={wallY + 2} stroke="rgba(135,206,235,0.4)" strokeWidth="0.8" />
        </>
      )}
      {/* Dimension label */}
      <text x={pad + w / 2} y={d + pad - 2} textAnchor="middle" fontSize="9" fill="#666">{Math.round(depth * 12)}" deep</text>
    </svg>
  )
}

const DOOR_DEPTH_PRESETS = [
  { value: 4, label: '4"' },
  { value: 4.5, label: '4.5"' },
  { value: 5, label: '5"' },
  { value: 6, label: '6"' },
]

function DoorForm({ onSave }) {
  const [width, setWidth] = useState(3)
  const [height, setHeight] = useState(8)
  const [depthInches, setDepthInches] = useState(4) // door frame depth in inches
  const [style, setStyle] = useState('single') // single, double, arch
  const [swing, setSwing] = useState('left')
  const [name, setName] = useState('')

  const depthFt = depthInches / 12 // convert to feet for saving
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
      height: depthFt, // plan-view: height of the set IS the depth (in feet)
      thickness: 0.292,
      icon_type: iconType,
      properties: { style, swing: style === 'double' ? 'both' : swing || 'left', elevationHeight: height, depth: depthFt },
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
        <label className="text-[11px] text-gray-400 block mb-1">Width (ft) — opening width</label>
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

      {/* Height (elevation) */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Height (ft) — elevation / face view</label>
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

      {/* Depth (plan view) — in inches */}
      <div>
        <label className="text-[11px] text-gray-400 block mb-1">Frame Depth (inches) — plan view footprint</label>
        <div className="flex gap-1 flex-wrap mb-1.5">
          {DOOR_DEPTH_PRESETS.map(d => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDepthInches(d.value)}
              className={`px-2 py-1 rounded text-xs ${
                depthInches === d.value ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <input
          type="number"
          value={depthInches}
          onChange={e => setDepthInches(parseFloat(e.target.value) || 0)}
          min="2"
          max="12"
          step="0.5"
          className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
        />
        <span className="text-[9px] text-gray-500 mt-0.5 block">
          Standard door frames: 4"–6" deep
        </span>
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
