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

// Build-time constants — defined in vite.config.js, string-replaced at compile.
/* global __APP_VERSION__, __APP_BUILD_DATE__ */
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
const APP_BUILD_DATE = typeof __APP_BUILD_DATE__ !== 'undefined' ? __APP_BUILD_DATE__ : ''

function App() {
  const { user, token } = useAuthStore()
  const viewMode = useStore(s => s.viewMode)
  const loadLatestProject = useStore(s => s.loadLatestProject)
  const projectName = useStore(s => s.projectName)
  const lastSaved = useStore(s => s.lastSaved)
  const [canvasSize, setCanvasSize] = useState({ w: 1200, h: 800 })
  const [bootStatus, setBootStatus] = useState('idle') // 'idle' | 'loading' | 'ready' | 'empty' | 'failed'
  const [bootMessage, setBootMessage] = useState(null)
  const bootLoadRan = useRef(false)

  // On login, fetch the user's most-recently-updated project from the server
  // and populate the (initially empty) Zustand store with it. The store no
  // longer rehydrates project content from localStorage, so this fetch is
  // the only source of truth for what gets rendered. While in flight we
  // show a loading screen so the canvas doesn't paint stale state.
  useEffect(() => {
    if (!token || !user || bootLoadRan.current) return
    bootLoadRan.current = true
    setBootStatus('loading')
    loadLatestProject()
      .then(result => {
        if (result) {
          console.log(`✅ Loaded latest project: ${result.name} (#${result.id}) — updated ${result.updated_at}`)
          setBootMessage(`Opened latest: ${result.name} (#${result.id})`)
          setBootStatus('ready')
        } else {
          console.log('ℹ️ No server projects for this user — starting blank')
          setBootMessage('No projects on server — start a new one')
          setBootStatus('empty')
        }
        setTimeout(() => setBootMessage(null), 4000)
      })
      .catch(err => {
        console.error('❌ Auto-load latest project failed:', err)
        setBootMessage(`Load failed: ${err.message}`)
        setBootStatus('failed')
        setTimeout(() => setBootMessage(null), 8000)
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

  // While the boot fetch is in flight, show a loading screen instead of
  // mounting the canvas against an empty store (which would briefly render
  // a blank plan and confuse the user).
  if (bootStatus === 'idle' || bootStatus === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-gray-300">
        <div className="text-center">
          <div className="text-3xl mb-3">📐</div>
          <div className="text-sm">Loading your latest project…</div>
        </div>
      </div>
    )
  }

  const is3D = viewMode === '3d'

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      {bootMessage && (
        <div
          className={`fixed top-2 right-2 z-50 px-3 py-2 rounded text-xs shadow-lg border ${
            bootStatus === 'ready' ? 'bg-green-900/90 border-green-700 text-green-100'
            : bootStatus === 'failed' ? 'bg-red-900/90 border-red-700 text-red-100'
            : 'bg-gray-800/90 border-gray-600 text-gray-100'
          }`}
        >
          {bootMessage}
        </div>
      )}
      <TopBar canvasSize={canvasSize} />
      {/* Thin status strip — version + build date + active project. Sits as
          its own row directly under the main toolbar so the version info
          never crams the TopBar height (which on iPad was forcing an
          extra wrapped row). */}
      <div className="flex items-center gap-3 px-4 py-0.5 bg-gray-850 bg-gray-900 text-[10px] text-gray-500 border-b border-gray-800 shrink-0 leading-none">
        <span className="text-gray-400">
          v{APP_VERSION}
        </span>
        <span>· Build {APP_BUILD_DATE}</span>
        {user?.username && <span>· @{user.username}</span>}
        {projectName && (
          <span className="truncate max-w-[40ch]" title={projectName}>
            · 📐 {projectName}
          </span>
        )}
        {lastSaved && (
          <span className="ml-auto text-gray-600" title={`Last save ${new Date(lastSaved).toLocaleString()}`}>
            saved {new Date(lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
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
