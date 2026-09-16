import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Eye, EyeOff, Images, ScanSearch, Shirt } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import Button from '../ui/Button'

const FEATURES = [
  { icon: Images, text: 'Batch upload kidswear in seconds' },
  { icon: ScanSearch, text: 'Detect, crop, and read every piece' },
  { icon: Shirt, text: 'Leave with listing-ready attributes' },
]

const fieldClass =
  'w-full rounded-2xl border border-ink/10 bg-white/90 px-4 py-3.5 text-sm text-ink shadow-soft outline-none transition placeholder:text-slate-400 focus:border-moss/40 focus:ring-4 focus:ring-moss/10'

export default function LoginPage() {
  const { session, loading, configured, signIn, signUp } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState(() => (new URLSearchParams(location.search).get('mode') === 'signup' ? 'signup' : 'login'))
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!loading && session) {
    return <Navigate to={location.state?.from?.pathname || '/dashboard'} replace />
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
      if (mode === 'signup') {
        await signUp(email.trim(), password, fullName.trim())
      } else {
        await signIn(email.trim(), password)
      }
    } catch (err) {
      setError(err.message || 'Could not sign in. Check your email and password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-dvh lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative isolate hidden min-h-dvh overflow-hidden lg:block">
        <img
          src="/landing/soft.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-ink/80 via-ink/55 to-moss/50" />
        <div className="bg-grain pointer-events-none absolute inset-0 opacity-30" />

        <div className="relative flex h-full flex-col justify-between px-12 py-14 xl:px-16 xl:py-16">
          <div className="flex items-center gap-3">
            <span className="font-display text-3xl font-semibold tracking-tight text-white">Kids AI</span>
            <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80">
              Seller
            </span>
          </div>

          <div className="max-w-lg">
            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-5xl font-medium leading-[1.08] text-white xl:text-6xl"
            >
              From a pile of clothes to a polished listing.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5 text-base leading-relaxed text-white/70"
            >
              Sign in to upload photos, watch the pipeline, and approve garments before they go live.
            </motion.p>

            <ul className="mt-10 space-y-3">
              {FEATURES.map((feature, i) => (
                <motion.li
                  key={feature.text}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.18 + i * 0.07 }}
                  className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white/90 backdrop-blur-md"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sand/90 text-ink">
                    <feature.icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  {feature.text}
                </motion.li>
              ))}
            </ul>
          </div>

          <p className="text-xs tracking-wide text-white/45">Secure seller workspace · AWS hosted</p>
        </div>
      </section>

      <section className="relative flex min-h-dvh flex-col justify-center overflow-hidden px-5 py-10 sm:px-8 lg:px-12 xl:px-16">
        <div
          className="pointer-events-none absolute inset-0 lg:hidden"
          style={{
            backgroundImage: 'url(/landing/soft.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 bg-surface/95 lg:bg-transparent" />
        <div className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-moss-soft/60 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-10 h-64 w-64 rounded-full bg-brand-100/50 blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="relative mx-auto w-full max-w-[420px]"
        >
          <Link
            to="/"
            className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-moss"
          >
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>

          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="font-display text-2xl font-semibold text-ink">Kids AI</span>
            <span className="rounded-full bg-moss-soft px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-moss">
              Seller
            </span>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
            {mode === 'login' ? 'Welcome back' : 'Join the studio'}
          </p>
          <h2 className="mt-2 font-display text-4xl font-semibold leading-tight text-ink sm:text-[2.75rem]">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {mode === 'login'
              ? 'Use your seller email to open your workspace.'
              : 'A few details and you can start uploading batches.'}
          </p>

          {location.state?.denied && (
            <p className="mt-5 rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              That account does not have seller access.
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {mode === 'signup' && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Full name</span>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={fieldClass}
                  placeholder="Ada Seller"
                  autoComplete="name"
                />
              </label>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
                placeholder="you@boutique.com"
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
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:text-ink"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {error && (
              <p className="rounded-2xl border border-rose-200/80 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full !rounded-full !bg-moss hover:!bg-[#334f40]"
              disabled={submitting}
            >
              {submitting ? 'Please wait…' : mode === 'login' ? 'Enter studio' : 'Create seller account'}
            </Button>
          </form>

          <div className="mt-8 flex items-center gap-3">
            <span className="h-px flex-1 bg-ink/10" />
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">or</span>
            <span className="h-px flex-1 bg-ink/10" />
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
            <button
              type="button"
              className="font-semibold text-moss underline-offset-4 hover:underline"
              onClick={() => {
                setError('')
                setMode((m) => (m === 'login' ? 'signup' : 'login'))
              }}
            >
              {mode === 'login' ? 'Create a seller account' : 'Sign in instead'}
            </button>
          </p>
        </motion.div>
      </section>
    </div>
  )
}
