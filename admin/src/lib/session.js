// Empty = same-origin /api (works on sslip, nip, and Cloudflare tunnel).
export const API_BASE = (import.meta.env.VITE_API_URL || '').trim()

const STORAGE_KEY = 'kids-ai-admin-auth'

export function getStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setStoredSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
}

export function getAccessToken() {
  return getStoredSession()?.access_token || null
}
