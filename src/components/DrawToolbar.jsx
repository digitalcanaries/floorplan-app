import useStore from '../store.js'

function ToolBtn({ active, onClick, icon, label, title, activeCls = 'bg-indigo-600 text-white' }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
        active ? activeCls : 'text-gray-300 hover:text-white hover:bg-gray-700'
      }`}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

// Always-on drawing toolbar (2D view). Quick access to the tools for laying a
// set out on the canvas: select, draw a set/room, draw walls, drop doors/
// windows/posts, and exclusion zones. Each button toggles the matching
// drawingMode; clicking the active tool again returns to Select.
export default function DrawToolbar() {
  const drawingMode = useStore(s => s.drawingMode)
  const setDrawingMode = useStore(s => s.setDrawingMode)
  const cancelDrawing = useStore(s => s.cancelDrawing)
  const startColumnPlacement = useStore(s => s.startColumnPlacement)
  const startComponentPlacement = useStore(s => s.startComponentPlacement)
  const columnTpl = useStore(s => s.columnPlacementTemplate)
  const compTpl = useStore(s => s.componentPlacementTemplate)
  const defaultWallHeight = useStore(s => s.defaultWallHeight)

  const isSelect = !drawingMode
  const toggleMode = (mode) => (drawingMode === mode ? cancelDrawing() : setDrawingMode(mode))
  const placeComp = (tpl) => {
    if (drawingMode === 'place-component' && compTpl?.name === tpl.name) cancelDrawing()
    else startComponentPlacement(tpl)
  }
  const placeCol = (tpl) => {
    if (drawingMode === 'place-column' && columnTpl?.label === tpl.label) cancelDrawing()
    else startColumnPlacement(tpl)
  }

  return (
    <div className="flex items-center gap-1 px-3 py-1 bg-gray-800 border-b border-gray-700 shrink-0 select-none overflow-x-auto">
      <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1 shrink-0">Draw</span>
      <ToolBtn active={isSelect} onClick={cancelDrawing} icon="⭯" label="Select"
        title="Select / move pieces (Esc)" activeCls="bg-gray-600 text-white" />
      <div className="h-4 w-px bg-gray-600 mx-0.5 shrink-0" />
      <ToolBtn active={drawingMode === 'draw-set'} onClick={() => toggleMode('draw-set')} icon="▭" label="Set"
        title="Draw a set / room — drag on the canvas to size it (snaps to grid)" />
      <ToolBtn active={drawingMode === 'building-wall'} onClick={() => toggleMode('building-wall')} icon="▬" label="Wall"
        title="Draw building walls — click to chain corners" />
      <ToolBtn active={drawingMode === 'place-component' && compTpl?.category === 'Door'}
        onClick={() => placeComp({ name: 'Door', width: 3, height: 0.292, category: 'Door', color: '#10B981', iconType: 'door', wallHeight: defaultWallHeight })}
        icon="🚪" label="Door" title="Place a door — click where it goes" />
      <ToolBtn active={drawingMode === 'place-component' && compTpl?.category === 'Window'}
        onClick={() => placeComp({ name: 'Window', width: 3, height: 0.292, category: 'Window', color: '#06B6D4', iconType: 'window', wallHeight: defaultWallHeight })}
        icon="🪟" label="Window" title="Place a window — click where it goes" />
      <ToolBtn active={drawingMode === 'place-column' && columnTpl?.label === '6"×8" Post'}
        onClick={() => placeCol({ width: 0.667, height: 0.5, shape: 'square', color: '#8B4513', label: '6"×8" Post' })}
        icon="▪" label="Post" title="Place a 6″×8″ wood post — click to drop (click again to place more)" />
      <div className="h-4 w-px bg-gray-600 mx-0.5 shrink-0" />
      <ToolBtn active={drawingMode === 'exclusion-zone'} onClick={() => toggleMode('exclusion-zone')} icon="⛔" label="No-Go"
        title="Draw an exclusion / no-go zone — drag to size" activeCls="bg-red-700 text-white" />
    </div>
  )
}
