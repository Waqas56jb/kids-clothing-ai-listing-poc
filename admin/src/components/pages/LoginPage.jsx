import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import Button from '../ui/Button'

const CLIENT_URL = import.meta.env.VITE_CLIENT_URL ?? (import.meta.env.DEV ? 'http://localhost:5173' : '/')

export default function LoginPage() {
  const { session, profile, loading, configured, signIn } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(location.state?.denied ? 'This console is for admin accounts only.' : '')

  if (!loading && session && profile?.role === 'admin') {
    return <Navigate to={location.state?.from?.pathname || '/'} replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!configured) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
      return
    }
    setSubmitting(true)
    try {
      const data = await signIn(email.trim(), password)
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()
      if (profileRow?.role !== 'admin') {
        await supabase.auth.signOut()
        setError('This console is for admin accounts only.')
      }
    } catch (err) {
      setError(err.message || 'Could not sign in. Check your admin email and password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-indigo-400/20 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative w-full max-w-md"
      >
        <div className="rounded-3xl border border-white/10 bg-white/95 p-6 shadow-elevated backdrop-blur-md sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-soft">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <p className="font-display text-xl font-bold text-slate-800">Admin Console</p>
              <p className="text-xs font-medium uppercase tracking-wide text-brand-600">Restricted access</p>
            </div>
          </div>

          <h1 className="mt-8 font-display text-3xl font-semibold text-ink sm:text-4xl">Sign in to review work</h1>
          <p className="mt-2 text-sm text-slate-500">
            Manage projects, detections, pricing, and listings across every seller.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin email</span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 shadow-soft outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                placeholder="you@email.com"
                autoComplete="email"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Password</span>
              <div className="relative">
                <input
                  required
                  minLength={6}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 pr-12 text-sm text-slate-800 shadow-soft outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {error && <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p>}

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              <LockKeyhole className="h-4 w-4" />
              {submitting ? 'Signing in…' : 'Enter console'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-brand-100">
          Looking for the seller app?{' '}
          <a href={CLIENT_URL} className="font-semibold text-white underline-offset-2 hover:underline">
            Go to seller login
          </a>
        </p>
      </motion.div>
    </div>
  )
}
