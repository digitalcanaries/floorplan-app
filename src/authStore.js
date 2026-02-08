import { create } from 'zustand'
import { login as apiLogin, logout as apiLogout, getStoredUser, getStoredToken, apiFetch } from './api.js'

const useAuthStore = create((set, get) => ({
  user: getStoredUser(),
  token: getStoredToken(),
  loading: false,
  error: null,

  login: async (username, password) => {
    set({ loading: true, error: null })
    try {
      const data = await apiLogin(username, password)
      set({ user: data.user, token: data.token, loading: false })
      return data
    } catch (e) {
      set({ loading: false, error: e.message })
      throw e
    }
  },

  logout: () => {
    apiLogout()
    set({ user: null, token: null })
  },

  changePassword: async (currentPassword, newPassword) => {
    const data = await apiFetch('/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    // Update token if returned
    if (data.token) {
      localStorage.setItem('floorplan-token', data.token)
      const user = { ...get().user, must_change_password: false }
      localStorage.setItem('floorplan-user', JSON.stringify(user))
      set({ token: data.token, user })
    }
    return data
  },

  // Refresh user info from server
  refreshUser: async () => {
    try {
      const user = await apiFetch('/me')
      localStorage.setItem('floorplan-user', JSON.stringify(user))
      set({ user })
    } catch {
      // If fails, token is bad — logout
      get().logout()
    }
  },
}))

export default useAuthStore
