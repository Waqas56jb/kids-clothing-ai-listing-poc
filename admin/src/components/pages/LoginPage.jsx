import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import Button from '../ui/Button'

const CLIENT_URL = import.meta.env.VITE_CLIENT_URL ?? (import.meta.env.DEV ? 'http://localhost:5173' : 'https://51.21.60.78.sslip.io')

const fieldClass =
  'w-full rounded-2xl border border-ink/10 bg-white/90 px-4 py-3.5 text-sm text-ink shadow-soft outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100'

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
      setError('API is not available. Check VITE_API_URL.')
      return
    }
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(err.message || 'Could not sign in. Check your admin email and password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-dvh lg:grid lg:grid-cols-[1fr_1fr]">
      <section className="relative isolate hidden min-h-dvh overflow-hidden lg:block">
        <img src="/landing/nursery.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-ink/85 via-brand-900/70 to-ink/75" />
        <div className="bg-grain pointer-events-none absolute inset-0 opacity-35" />

        <div className="relative flex h-full flex-col justify-between px-12 py-14 xl:px-16">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-2xl font-semibold text-white">Kids AI</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">Admin console</p>
            </div>
          </div>

          <div className="max-w-md">
            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-5xl font-medium leading-[1.08] text-white xl:text-[3.25rem]"
            >
              Review every batch with calm precision.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.65 }}
              className="mt-5 text-base leading-relaxed text-white/65"
            >
              Projects, detections, pricing, and listings across every seller — one secure console.
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="mt-10 grid grid-cols-3 gap-3"
            >
              {[
                { k: 'Ops', v: 'Live jobs' },
                { k: 'QA', v: 'Review queue' },
                { k: 'List', v: 'Publish ready' },
              ].map((item) => (
                <div
                  key={item.k}
                  className="rounded-2xl border border-white/15 bg-white/10 px-3 py-4 backdrop-blur-md"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">{item.k}</p>
                  <p className="mt-1.5 text-sm font-semibold text-white">{item.v}</p>
                </div>
              ))}
            </motion.div>
          </div>

          <p className="text-xs text-white/40">Restricted access · Role-checked on every request</p>
        </div>
      </section>

      <section className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-10 sm:px-8">
        <div
          className="pointer-events-none absolute inset-0 lg:hidden"
          style={{
            backgroundImage: 'url(/landing/nursery.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 bg-surface/96 lg:bg-surface/40" />
        <div className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-64 w-64 rounded-full bg-gold/15 blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative w-full max-w-[420px]"
        >
          <div className="rounded-[1.75rem] border border-white/70 bg-white/90 p-6 shadow-elevated backdrop-blur-xl sm:p-8">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-700 text-white">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-xl font-semibold text-ink">Kids AI</p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-600">Admin</p>
              </div>
            </div>

            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gold lg:mt-0">
              Restricted
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">Sign in</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Enter with your admin credentials to open the operations console.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin email</span>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldClass}
                  placeholder="admin@kidsailisting.com"
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
                    className={`${fieldClass} pr-12`}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-ink"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              {error && (
                <p className="rounded-2xl border border-rose-200/80 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
              )}

              <Button type="submit" size="lg" className="w-full !rounded-full" disabled={submitting}>
                <LockKeyhole className="h-4 w-4" />
                {submitting ? 'Signing in…' : 'Enter console'}
              </Button>
            </form>
          </div>

          <p className="mt-7 text-center text-sm text-slate-500">
            Looking for the seller app?{' '}
            <a href={CLIENT_URL} className="font-semibold text-brand-700 underline-offset-4 hover:underline">
              Open seller login
            </a>
          </p>
        </motion.div>
      </section>
    </div>
  )
}
