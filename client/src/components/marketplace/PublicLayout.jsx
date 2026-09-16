import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Baby, Menu, Store, UploadCloud, X } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { BRAND } from '../../lib/sv'

const NAV = [
  { to: '/marknad', label: 'Marknaden', icon: Store },
  { to: '/upload', label: 'Sälj kläder', icon: UploadCloud },
]

function navClass({ isActive }) {
  return `rounded-full px-3.5 py-2 text-sm font-medium transition ${
    isActive ? 'bg-ink text-sand' : 'text-ink/70 hover:bg-ink/5 hover:text-ink'
  }`
}

export default function PublicLayout() {
  const { session, profile } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const next = encodeURIComponent(`${location.pathname}${location.search}`)

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <header className="safe-top sticky top-0 z-40 border-b border-ink/5 bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink text-sand shadow-soft">
              <Baby className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-display text-xl font-semibold leading-none tracking-tight">{BRAND}</span>
              <span className="mt-0.5 hidden text-[10px] font-medium uppercase tracking-[0.22em] text-ink/45 sm:block">
                Begagnade barnkläder
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={navClass}>
                {item.label}
              </NavLink>
            ))}
            {session ? (
              <NavLink to="/dashboard" className={navClass}>
                Min sida{profile?.full_name ? ` · ${profile.full_name.split(' ')[0]}` : ''}
              </NavLink>
            ) : (
              <>
                <Link to={`/login?next=${next}`} className="rounded-full px-3.5 py-2 text-sm font-medium text-ink/70 hover:text-ink">
                  Logga in
                </Link>
                <Link
                  to="/login?mode=signup"
                  className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-sand transition hover:bg-moss"
                >
                  Skapa konto
                </Link>
              </>
            )}
          </nav>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink/5 text-ink md:hidden"
            aria-label="Meny"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.nav
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mx-4 mb-3 flex flex-col gap-1 rounded-2xl bg-white p-2 shadow-elevated md:hidden"
            >
              {NAV.map((item) => (
                <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-sand">
                  <item.icon className="h-4 w-4" /> {item.label}
                </NavLink>
              ))}
              {session ? (
                <Link to="/dashboard" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-sand">
                  Min sida
                </Link>
              ) : (
                <div className="mt-1 grid grid-cols-2 gap-2 border-t border-ink/5 pt-2">
                  <Link to={`/login?next=${next}`} onClick={() => setOpen(false)} className="rounded-xl bg-sand px-3 py-2.5 text-center text-sm font-semibold">
                    Logga in
                  </Link>
                  <Link to="/login?mode=signup" onClick={() => setOpen(false)} className="rounded-xl bg-ink px-3 py-2.5 text-center text-sm font-semibold text-sand">
                    Skapa konto
                  </Link>
                </div>
              )}
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <main className="safe-bottom">
        <Outlet />
      </main>

      <footer className="border-t border-ink/10 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 text-center text-xs text-ink/50 sm:flex-row sm:text-left">
          <p>© {new Date().getFullYear()} {BRAND} · Köp och sälj begagnade barnkläder.</p>
          <div className="flex gap-4">
            <Link to="/" className="hover:text-ink">
              Så funkar det
            </Link>
            <Link to="/marknad" className="hover:text-ink">
              Marknaden
            </Link>
            <Link to="/login?mode=signup" className="hover:text-ink">
              Bli säljare
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
