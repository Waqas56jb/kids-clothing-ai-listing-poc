import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Baby } from 'lucide-react'
import { useAuth } from './AuthContext'

export function AuthSplash({ label = 'Kids AI Listing' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-4">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-elevated">
        <Baby className="h-7 w-7 animate-pulse-soft" />
      </span>
      <p className="font-display text-lg font-bold text-slate-800">{label}</p>
      <p className="text-sm text-slate-500">Signing you in…</p>
    </div>
  )
}

export default function ProtectedRoute({ role }) {
  const { loading, session, profile } = useAuth()
  const location = useLocation()

  if (loading) return <AuthSplash />
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  if (role && profile && profile.role !== role) {
    return <Navigate to="/login" replace state={{ denied: true }} />
  }
  return <Outlet />
}
