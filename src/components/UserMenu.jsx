import { useState, useRef, useEffect } from 'react'
import useAuthStore from '../authStore.js'
import { apiFetch } from '../api.js'
import ChangePasswordModal from './ChangePasswordModal.jsx'
import HelpGuide from './HelpGuide.jsx'

export default function UserMenu() {
  const { user, logout } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
      >
        <span className="text-gray-300">{user?.display_name || user?.username}</span>
        <span className="text-gray-500 text-xs ml-1">▼</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 min-w-[160px]">
          <button
            onClick={() => { setShowHelp(true); setOpen(false) }}
            className="w-full text-left px-4 py-2 text-sm text-indigo-300 hover:bg-gray-700 transition-colors"
          >
            Help &amp; User Guide
          </button>
          <hr className="border-gray-700" />
          <button
            onClick={() => { setShowChangePassword(true); setOpen(false) }}
            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Change Password
          </button>
          {user?.is_admin && (
            <button
              onClick={() => { setShowAdmin(true); setOpen(false) }}
              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Manage Users
            </button>
          )}
          <hr className="border-gray-700" />
          <button
            onClick={() => { logout(); setOpen(false) }}
            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      {showHelp && <HelpGuide onClose={() => setShowHelp(false)} />}
    </div>
  )
}

function AdminPanel({ onClose }) {
  const [users, setUsers] = useState([])
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadUsers = async () => {
    try {
      const data = await apiFetch('/admin/users')
      setUsers(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newUsername || !newPassword) return
    setError(null)
    try {
      await apiFetch('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          display_name: newDisplayName || newUsername,
        }),
      })
      setNewUsername('')
      setNewPassword('')
      setNewDisplayName('')
      loadUsers()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleDelete = async (id, username) => {
    if (!confirm(`Delete user "${username}"? Their projects will also be deleted.`)) return
    try {
      await apiFetch(`/admin/users/${id}`, { method: 'DELETE' })
      loadUsers()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleResetPassword = async (id) => {
    const pw = prompt('Enter new password (min 4 chars):')
    if (!pw || pw.length < 4) return
    try {
      await apiFetch(`/admin/users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: pw }),
      })
      alert('Password reset. User will be asked to change it on next login.')
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-[480px] max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-white">Manage Users</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">×</button>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-3 py-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="mb-6 p-3 bg-gray-900 rounded">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Create User</h3>
          <div className="flex gap-2 mb-2">
            <input
              placeholder="Username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="flex-1 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              placeholder="Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="flex-1 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <input
              placeholder="Display Name (optional)"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              className="flex-1 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!newUsername || !newPassword}
              className="px-4 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-sm rounded transition-colors"
            >
              Add
            </button>
          </div>
        </form>

        {loading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2">Username</th>
                <th className="text-left py-2">Display Name</th>
                <th className="text-right py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-gray-700/50">
                  <td className="py-2 text-white">
                    {u.username}
                    {u.is_admin ? <span className="ml-1 text-xs text-yellow-400">(admin)</span> : ''}
                  </td>
                  <td className="py-2 text-gray-300">{u.display_name}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleResetPassword(u.id)}
                      className="text-blue-400 hover:text-blue-300 text-xs mr-2"
                    >
                      Reset PW
                    </button>
                    {!u.is_admin && (
                      <button
                        onClick={() => handleDelete(u.id, u.username)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
