import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from './AuthContext'

export function AuthSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-900 px-4">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-white shadow-elevated">
        <ShieldCheck className="h-7 w-7 animate-pulse-soft" />
      </span>
      <p className="font-display text-lg font-bold text-white">Admin Console</p>
      <p className="text-sm text-brand-200">Checking your access…</p>
    </div>
  )
}

export default function ProtectedRoute() {
  const { loading, session, profile, signOut } = useAuth()
  const location = useLocation()

  useEffect(() => {
    if (profile && profile.role !== 'admin') signOut()
  }, [profile, signOut])

  if (loading) return <AuthSplash />
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  if (!profile || profile.role !== 'admin') {
    return <Navigate to="/login" replace state={{ denied: true }} />
  }
  return <Outlet />
}
