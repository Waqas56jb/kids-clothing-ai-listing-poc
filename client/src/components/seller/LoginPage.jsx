import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Baby, Eye, EyeOff, Images, ScanSearch, Shirt, Sparkles } from 'lucide-react'
import { toast } from 'react-toastify'
import { useAuth } from '../../auth/AuthContext'
import Button from '../ui/Button'

const FEATURES = [
  { icon: Images, text: 'Upload a batch of kidswear photos in seconds' },
  { icon: ScanSearch, text: 'AI detects, crops, and reads every garment' },
  { icon: Shirt, text: 'Walk out with listing-ready attributes' },
]

export default function LoginPage() {
  const { session, loading, configured, signIn, signUp } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!loading && session) {
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
      if (mode === 'signup') {
        const data = await signUp(email.trim(), password, fullName.trim())
        if (!data.session) {
          toast.info('Account created. Confirm your email, then sign in.')
          setMode('login')
        }
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
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 px-6 py-10 text-white sm:px-10 lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-16">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-sky-300/20 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 shadow-soft">
              <Baby className="h-6 w-6" />
            </span>
            <div>
              <p className="font-display text-lg font-bold">Kids AI Listing</p>
              <p className="text-xs text-brand-100">Seller workspace</p>
            </div>
          </div>
          <h1 className="mt-8 max-w-md font-display text-4xl font-semibold leading-[1.15] sm:text-5xl lg:mt-16">
            From a pile of clothes to a polished listing.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-brand-100 sm:text-base">
            Sign in to upload photos, watch the AI pipeline, and review garments before they go live.
          </p>
        </div>

        <ul className="relative mt-10 hidden space-y-4 lg:block">
          {FEATURES.map((feature) => (
            <li key={feature.text} className="flex items-start gap-3 text-sm text-brand-50">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <feature.icon className="h-4 w-4" />
              </span>
              {feature.text}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md"
        >
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <Sparkles className="h-5 w-5 text-brand-600" />
            <p className="text-sm font-semibold text-slate-600">Seller sign in</p>
          </div>

          <h2 className="font-display text-3xl font-semibold text-ink sm:text-4xl">
            {mode === 'login' ? 'Welcome back' : 'Create your seller account'}
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            {mode === 'login' ? 'Use your seller email to continue.' : 'A couple of details and you can start uploading.'}
          </p>

          {location.state?.denied && (
            <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
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
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 shadow-soft outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
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
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 shadow-soft outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 pr-12 text-sm text-slate-800 shadow-soft outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
              {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
            <button
              type="button"
              className="font-semibold text-brand-700 hover:underline"
              onClick={() => {
                setError('')
                setMode((m) => (m === 'login' ? 'signup' : 'login'))
              }}
            >
              {mode === 'login' ? 'Create a seller account' : 'Sign in instead'}
            </button>
          </p>

          <p className="mt-8 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-xs leading-relaxed text-slate-500 shadow-soft">
            Demo seller: <span className="font-semibold text-slate-700">seller@kidsailisting.com</span> /{' '}
            <span className="font-semibold text-slate-700">SellerDemo123!</span>
          </p>
        </motion.div>
      </section>
    </div>
  )
}
