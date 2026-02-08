const API_BASE = '/api'

function getToken() {
  return localStorage.getItem('floorplan-token')
}

export async function apiFetch(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    // Token expired or invalid — clear and reload
    localStorage.removeItem('floorplan-token')
    localStorage.removeItem('floorplan-user')
    window.location.reload()
    throw new Error('Session expired')
  }

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export async function login(username, password) {
  const data = await apiFetch('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  localStorage.setItem('floorplan-token', data.token)
  localStorage.setItem('floorplan-user', JSON.stringify(data.user))
  return data
}

export function logout() {
  localStorage.removeItem('floorplan-token')
  localStorage.removeItem('floorplan-user')
}

export function getStoredUser() {
  try {
    const u = localStorage.getItem('floorplan-user')
    return u ? JSON.parse(u) : null
  } catch { return null }
}

export function getStoredToken() {
  return localStorage.getItem('floorplan-token')
}
