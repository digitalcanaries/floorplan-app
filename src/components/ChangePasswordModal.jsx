import { useState } from 'react'
import useAuthStore from '../authStore.js'

export default function ChangePasswordModal({ forced, onClose }) {
  const { changePassword, user } = useAuthStore()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (newPassword !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (newPassword.length < 4) {
      setError('Password must be at least 4 characters')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await changePassword(forced ? null : currentPassword, newPassword)
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg shadow-xl w-80">
        <h2 className="text-lg font-bold text-white mb-4">
          {forced ? 'Set New Password' : 'Change Password'}
        </h2>

        {forced && (
          <p className="text-yellow-400 text-sm mb-4">
            You must change your password before continuing.
          </p>
        )}

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-3 py-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        {!forced && (
          <>
            <label className="block text-gray-300 text-sm mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none mb-4"
            />
          </>
        )}

        <label className="block text-gray-300 text-sm mb-1">New Password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none mb-4"
          autoFocus={forced}
        />

        <label className="block text-gray-300 text-sm mb-1">Confirm Password</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none mb-6"
        />

        <div className="flex gap-2">
          {!forced && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium rounded transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
