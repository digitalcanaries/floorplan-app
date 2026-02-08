import { useState } from 'react'
import useAuthStore from './authStore.js'
import TopBar from './components/TopBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import FloorCanvas from './components/FloorCanvas.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import ChangePasswordModal from './components/ChangePasswordModal.jsx'

function App() {
  const { user, token } = useAuthStore()
  const [canvasSize, setCanvasSize] = useState({ w: 1200, h: 800 })

  // Not logged in — show login
  if (!token || !user) {
    return <LoginScreen />
  }

  // Must change password — force modal
  if (user.must_change_password) {
    return (
      <div className="h-screen flex flex-col bg-gray-900 text-white">
        <ChangePasswordModal forced onClose={() => {}} />
      </div>
    )
  }

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
