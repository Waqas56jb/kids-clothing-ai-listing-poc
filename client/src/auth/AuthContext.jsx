import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { API_BASE, clearSession, getStoredSession, setStoredSession } from '../lib/session'

const AuthContext = createContext(null)

async function authRequest(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.detail === 'string' ? data.detail : 'Inloggningen misslyckades')
  }
  return data
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = getStoredSession()
    if (stored?.access_token && stored?.user) {
      setSession({ access_token: stored.access_token, user: stored.user })
      setProfile(stored.profile || stored.user)
    }
    setLoading(false)
  }, [])

  const signIn = useCallback(async (email, password) => {
    const data = await authRequest('/api/auth/login', { email, password })
    const next = {
      access_token: data.access_token,
      user: data.user,
      profile: data.profile || data.user,
    }
    setStoredSession(next)
    setSession({ access_token: next.access_token, user: next.user })
    setProfile(next.profile)
    return data
  }, [])

  const signUp = useCallback(async (email, password, fullName) => {
    const data = await authRequest('/api/auth/signup', {
      email,
      password,
      full_name: fullName,
    })
    const next = {
      access_token: data.access_token,
      user: data.user,
      profile: data.profile || data.user,
    }
    setStoredSession(next)
    setSession({ access_token: next.access_token, user: next.user })
    setProfile(next.profile)
    return data
  }, [])

  const signOut = useCallback(async () => {
    clearSession()
    setSession(null)
    setProfile(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      loading,
      configured: true,
      signIn,
      signUp,
      signOut,
    }),
    [session, profile, loading, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
