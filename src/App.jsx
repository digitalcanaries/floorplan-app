import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import useAuthStore from './authStore.js'
import useStore from './store.js'
import TopBar from './components/TopBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import FloorCanvas from './components/FloorCanvas.jsx'
import QuickActionsBar from './components/QuickActionsBar.jsx'
import DrawToolbar from './components/DrawToolbar.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import ChangePasswordModal from './components/ChangePasswordModal.jsx'
import EditSetModal from './components/EditSetModal.jsx'
import ReferenceSheetModal from './components/ReferenceSheetModal.jsx'

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
  const setReferencesPanelTarget = useStore(s => s.setReferencesPanelTarget)
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
      {/* Status strip — version + build date + active project. Its own row
          directly under TopBar so the metadata doesn't cram the toolbar
          height. Bumped to py-1 + gray-800 with an indigo version pill so
          it's actually visible on iPad. */}
      <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 text-[11px] text-gray-300 border-b border-gray-700 shrink-0 leading-none">
        <span className="px-1.5 py-0.5 rounded bg-indigo-700 text-white font-medium tracking-wide">
          v{APP_VERSION}
        </span>
        <span className="text-gray-400">Build {APP_BUILD_DATE}</span>
        {user?.username && <span className="text-gray-400">· @{user.username}</span>}
        {projectName && (
          <span className="truncate max-w-[40ch] text-gray-200" title={projectName}>
            · 📐 {projectName}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {lastSaved && (
            <span className="text-gray-500" title={`Last save ${new Date(lastSaved).toLocaleString()}`}>
              saved {new Date(lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {/* Project-level references — mood boards, script, anything not
              tied to a specific set. */}
          <button
            onClick={() => setReferencesPanelTarget('project')}
            title="Project-wide references — photos / PDFs / paint / furniture not tied to one set"
            className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-[10px] leading-none"
          >
            📎 Project Refs
          </button>
          {/* Refresh — pulls fresh bundle + project from the server in one tap.
              Avoids the logout/login dance when iPad is showing stale data. */}
          <button
            onClick={() => window.location.reload()}
            title="Reload — pulls the latest bundle and project data without signing out"
            className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-[10px] leading-none"
          >
            🔄 Refresh
          </button>
        </span>
      </div>
      {!is3D && <DrawToolbar />}
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
      <EditSetModal />
      <ReferenceSheetModal />
    </div>
  )
}

export default App
