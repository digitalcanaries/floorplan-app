import { useState, useRef, useCallback } from 'react'
import useStore from '../store.js'
import PdfUploader from './PdfUploader.jsx'
import SetsTab from './SetsTab.jsx'
import BuildTab from './BuildTab.jsx'
import RulesTab from './RulesTab.jsx'

const MIN_WIDTH = 200
const MAX_WIDTH = 600
const DEFAULT_WIDTH = 288

export default function Sidebar() {
  const { sidebarTab, setSidebarTab } = useStore()
  const [width, setWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('floorplan-sidebar-width')
      if (saved) return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parseInt(saved)))
    } catch {}
    return DEFAULT_WIDTH
  })
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(DEFAULT_WIDTH)
  const latestWidth = useRef(width)

  const onMouseDown = useCallback((e) => {
    e.preventDefault()
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = latestWidth.current
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (e) => {
      if (!isDragging.current) return
      // Sidebar is on the LEFT, so dragging right = wider
      const delta = e.clientX - startX.current
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth.current + delta))
      latestWidth.current = newWidth
      setWidth(newWidth)
    }

    const onMouseUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      try { localStorage.setItem('floorplan-sidebar-width', String(latestWidth.current)) } catch {}
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  return (
    <div className="flex shrink-0 overflow-hidden" style={{ width }}>
      <div className="flex-1 bg-gray-800 text-white flex flex-col overflow-hidden">
        <PdfUploader />

        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setSidebarTab('sets')}
            className={`flex-1 px-3 py-2 text-sm font-medium ${
              sidebarTab === 'sets' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Sets
          </button>
          <button
            onClick={() => setSidebarTab('build')}
            className={`flex-1 px-3 py-2 text-sm font-medium ${
              sidebarTab === 'build' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Build
          </button>
          <button
            onClick={() => setSidebarTab('rules')}
            className={`flex-1 px-3 py-2 text-sm font-medium ${
              sidebarTab === 'rules' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Rules
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sidebarTab === 'sets' ? <SetsTab /> : sidebarTab === 'build' ? <BuildTab /> : <RulesTab />}
        </div>
      </div>
      {/* Resize handle on right edge */}
      <div
        onMouseDown={onMouseDown}
        className="w-1.5 cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500/70 transition-colors bg-gray-700 shrink-0"
        title="Drag to resize sidebar"
      />
    </div>
  )
}
