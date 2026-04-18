import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import useAuthStore from './authStore.js'
import useStore from './store.js'
import TopBar from './components/TopBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import FloorCanvas from './components/FloorCanvas.jsx'
import QuickActionsBar from './components/QuickActionsBar.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import ChangePasswordModal from './components/ChangePasswordModal.jsx'

const Scene3D = lazy(() => import('./components/Scene3D.jsx'))

function App() {
  const { user, token } = useAuthStore()
  const viewMode = useStore(s => s.viewMode)
  const loadLatestProject = useStore(s => s.loadLatestProject)
  const [canvasSize, setCanvasSize] = useState({ w: 1200, h: 800 })
  const bootLoadRan = useRef(false)

  // On login, pull the user's most-recently-updated project from the server
  // and replace the rehydrated-from-localStorage state with it. This fires
  // once per browser session so a refresh always lands on the latest save.
  useEffect(() => {
    if (!token || !user || bootLoadRan.current) return
    bootLoadRan.current = true
    loadLatestProject().then(result => {
      if (result) console.log(`✅ Loaded latest project: ${result.name} (#${result.id})`)
    })
  }, [token, user, loadLatestProject])

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

  const is3D = viewMode === '3d'

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      <TopBar canvasSize={canvasSize} />
      <QuickActionsBar />
      <div className="flex flex-1 overflow-hidden">
        {!is3D && <Sidebar />}
        {is3D ? (
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <div className="text-2xl mb-2">🎬</div>
                <div>Loading 3D Scene...</div>
              </div>
            </div>
          }>
            <Scene3D />
          </Suspense>
        ) : (
          <FloorCanvas onCanvasSize={setCanvasSize} />
        )}
      </div>
    </div>
  )
}

export default App
