import { useState } from 'react'
import TopBar from './components/TopBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import FloorCanvas from './components/FloorCanvas.jsx'

function App() {
  const [canvasSize, setCanvasSize] = useState({ w: 1200, h: 800 })

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      <TopBar canvasSize={canvasSize} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <FloorCanvas onCanvasSize={setCanvasSize} />
      </div>
    </div>
  )
}

export default App
