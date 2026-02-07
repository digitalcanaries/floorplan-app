import { useRef, useState, useEffect } from 'react'
import useStore from '../store.js'
import { autoLayout, tryAlternate } from '../engine/autoLayout.js'

export default function TopBar({ canvasSize }) {
  const {
    sets, rules, pixelsPerUnit, setSets, pdfRotation, setPdfRotation,
    gridVisible, setGridVisible, snapToGrid, setSnapToGrid,
    exportProject, importProject, clearAll,
    calibrating, setCalibrating,
    projectName, setProjectName, lastSaved,
    saveProjectAs, getSavedProjects, loadSavedProject, deleteSavedProject,
  } = useStore()

  const loadInputRef = useRef(null)
  const [showSaveMenu, setShowSaveMenu] = useState(false)
  const [showLoadMenu, setShowLoadMenu] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(projectName)
  const [savedProjects, setSavedProjectsList] = useState({})
  const [saveFlash, setSaveFlash] = useState(false)

  // Flash the autosave indicator briefly when lastSaved changes
  useEffect(() => {
    if (!lastSaved) return
    setSaveFlash(true)
    const t = setTimeout(() => setSaveFlash(false), 1500)
    return () => clearTimeout(t)
  }, [lastSaved])

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

  // Save to file
  const handleSaveFile = () => {
    const data = exportProject()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName.replace(/[^a-zA-Z0-9-_ ]/g, '')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Save project (quick save to localStorage)
  const handleQuickSave = () => {
    saveProjectAs(projectName)
  }

  // Save As (prompt for name)
  const handleSaveAs = () => {
    const name = prompt('Project name:', projectName)
    if (name && name.trim()) {
      saveProjectAs(name.trim())
      setShowSaveMenu(false)
    }
  }

  // Load from file
  const handleLoadFile = (e) => {
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
    const lowerCanvas = document.querySelector('.canvas-container canvas:first-child')
    const target = lowerCanvas || canvas
    const link = document.createElement('a')
    link.download = `${projectName.replace(/[^a-zA-Z0-9-_ ]/g, '')}.png`
    link.href = target.toDataURL('image/png')
    link.click()
  }

  const openLoadMenu = () => {
    setSavedProjectsList(getSavedProjects())
    setShowLoadMenu(true)
    setShowSaveMenu(false)
  }

  const handleNameSubmit = () => {
    if (nameInput.trim()) {
      setProjectName(nameInput.trim())
    }
    setEditingName(false)
  }

  const formatTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const diff = now - d
    if (diff < 5000) return 'just now'
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm border-b border-gray-700 shrink-0 relative">
      {/* Project name — click to edit */}
      {editingName ? (
        <input
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onBlur={handleNameSubmit}
          onKeyDown={e => e.key === 'Enter' && handleNameSubmit()}
          autoFocus
          className="font-bold text-base bg-gray-700 border border-gray-500 rounded px-1 py-0.5 text-white w-48"
        />
      ) : (
        <button
          onClick={() => { setNameInput(projectName); setEditingName(true) }}
          className="font-bold text-base mr-1 hover:text-blue-300 truncate max-w-48"
          title="Click to rename project"
        >
          {projectName}
        </button>
      )}

      {/* Autosave indicator */}
      <span className={`text-xs transition-opacity duration-500 ${saveFlash ? 'text-green-400 opacity-100' : 'text-gray-500 opacity-60'}`}>
        {lastSaved ? `Saved ${formatTime(lastSaved)}` : ''}
      </span>

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

      {/* Save dropdown */}
      <div className="relative">
        <div className="flex">
          <button onClick={handleQuickSave}
            className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded-l text-xs border-r border-green-800">
            Save
          </button>
          <button onClick={() => { setShowSaveMenu(!showSaveMenu); setShowLoadMenu(false) }}
            className="px-1.5 py-1 bg-green-700 hover:bg-green-600 rounded-r text-xs">
            <span className="text-[10px]">&#x25BC;</span>
          </button>
        </div>
        {showSaveMenu && (
          <div className="absolute right-0 top-full mt-1 bg-gray-700 border border-gray-600 rounded shadow-lg z-50 min-w-40">
            <button onClick={() => { handleQuickSave(); setShowSaveMenu(false) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-600">
              Save Project
            </button>
            <button onClick={handleSaveAs}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-600">
              Save As...
            </button>
            <div className="h-px bg-gray-600" />
            <button onClick={() => { handleSaveFile(); setShowSaveMenu(false) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-600">
              Export to File
            </button>
          </div>
        )}
      </div>

      {/* Load dropdown */}
      <div className="relative">
        <button onClick={openLoadMenu}
          className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-xs">
          Load
        </button>
        {showLoadMenu && (
          <div className="absolute right-0 top-full mt-1 bg-gray-700 border border-gray-600 rounded shadow-lg z-50 min-w-52 max-h-60 overflow-y-auto">
            <button onClick={() => { loadInputRef.current?.click(); setShowLoadMenu(false) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-600 border-b border-gray-600">
              Load from File...
            </button>
            {Object.keys(savedProjects).length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">No saved projects</div>
            ) : (
              Object.entries(savedProjects).map(([name, data]) => (
                <div key={name} className="flex items-center gap-1 px-3 py-1.5 hover:bg-gray-600 group">
                  <button
                    onClick={() => { loadSavedProject(name); setShowLoadMenu(false) }}
                    className="flex-1 text-left text-xs truncate"
                  >
                    <span className="text-white">{name}</span>
                    <span className="text-gray-400 ml-1 text-[10px]">
                      {data.sets?.length || 0} sets
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteSavedProject(name)
                      setSavedProjectsList(getSavedProjects())
                    }}
                    className="text-red-400 hover:text-red-300 text-[10px] opacity-0 group-hover:opacity-100"
                  >
                    &#x2715;
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <input ref={loadInputRef} type="file" accept=".json" className="hidden" onChange={handleLoadFile} />

      <button onClick={handleExportPNG}
        className="px-2 py-1 bg-purple-700 hover:bg-purple-600 rounded text-xs">
        Export PNG
      </button>

      <button onClick={() => { if (confirm('Clear all data? This cannot be undone.')) clearAll() }}
        className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs">
        Clear All
      </button>

      {/* Click away to close menus */}
      {(showSaveMenu || showLoadMenu) && (
        <div className="fixed inset-0 z-40" onClick={() => { setShowSaveMenu(false); setShowLoadMenu(false) }} />
      )}
    </div>
  )
}
