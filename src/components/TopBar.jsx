import { useRef } from 'react'
import useStore from '../store.js'
import { autoLayout, tryAlternate } from '../engine/autoLayout.js'

export default function TopBar({ canvasSize }) {
  const {
    sets, rules, pixelsPerUnit, setSets, pdfRotation, setPdfRotation,
    gridVisible, setGridVisible, snapToGrid, setSnapToGrid,
    exportProject, importProject, clearAll,
    calibrating, setCalibrating,
  } = useStore()

  const fileInputRef = useRef(null)
  const loadInputRef = useRef(null)

  const handleAutoLayout = () => {
    const result = autoLayout(sets, rules, pixelsPerUnit, canvasSize.w, canvasSize.h)
    setSets(result)
  }

  const handleTryAlternate = () => {
    const result = tryAlternate(sets, rules, pixelsPerUnit, canvasSize.w, canvasSize.h)
    setSets(result)
  }

  const handleClearLayout = () => {
    const cleared = sets.map(s => ({ ...s, x: 100, y: 100 }))
    setSets(cleared)
  }

  const handleSave = () => {
    const data = exportProject()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'floorplan-project.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleLoad = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        importProject(data)
      } catch (err) {
        alert('Invalid project file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleExportPNG = () => {
    const canvas = document.querySelector('canvas.upper-canvas, canvas')
    if (!canvas) return
    // Get the lower canvas (the one with actual content)
    const lowerCanvas = document.querySelector('.canvas-container canvas:first-child')
    const target = lowerCanvas || canvas
    const link = document.createElement('a')
    link.download = 'floorplan.png'
    link.href = target.toDataURL('image/png')
    link.click()
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm border-b border-gray-700 shrink-0">
      <span className="font-bold text-base mr-2">Floor Plan</span>
      <div className="h-5 w-px bg-gray-600" />

      <button onClick={() => setPdfRotation((pdfRotation + 90) % 360)}
        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">
        Rotate PDF
      </button>

      <button onClick={() => setCalibrating(!calibrating)}
        className={`px-2 py-1 rounded text-xs ${calibrating ? 'bg-yellow-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
        {calibrating ? 'Calibrating...' : 'Calibrate Scale'}
      </button>

      <label className="flex items-center gap-1 text-xs cursor-pointer">
        <input type="checkbox" checked={gridVisible} onChange={e => setGridVisible(e.target.checked)} />
        Grid
      </label>

      <label className="flex items-center gap-1 text-xs cursor-pointer">
        <input type="checkbox" checked={snapToGrid} onChange={e => setSnapToGrid(e.target.checked)} />
        Snap
      </label>

      <div className="h-5 w-px bg-gray-600" />

      <button onClick={handleAutoLayout} disabled={sets.length === 0}
        className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded text-xs">
        Auto Layout
      </button>
      <button onClick={handleTryAlternate} disabled={sets.length === 0}
        className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded text-xs">
        Try Alternate
      </button>
      <button onClick={handleClearLayout} disabled={sets.length === 0}
        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded text-xs">
        Clear Layout
      </button>

      <div className="flex-1" />

      <button onClick={handleSave}
        className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-xs">
        Save Project
      </button>
      <button onClick={() => loadInputRef.current?.click()}
        className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-xs">
        Load Project
      </button>
      <input ref={loadInputRef} type="file" accept=".json" className="hidden" onChange={handleLoad} />

      <button onClick={handleExportPNG}
        className="px-2 py-1 bg-purple-700 hover:bg-purple-600 rounded text-xs">
        Export PNG
      </button>

      <button onClick={clearAll}
        className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs">
        Clear All
      </button>
    </div>
  )
}
