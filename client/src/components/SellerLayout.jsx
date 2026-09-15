import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'

const NAV_LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/upload', label: 'New Upload' },
]

export default function SellerLayout() {
  const location = useLocation()
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-lg text-white shadow-soft">
              🧸
            </span>
            <span className="hidden whitespace-nowrap font-display text-lg font-bold text-slate-800 sm:inline">
              Kids AI Listing
            </span>
          </div>

          <nav className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <a
              href="/admin"
              className="ml-2 hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 sm:inline-block"
            >
              Admin →
            </a>
          </nav>
        </div>
      </header>

      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="flex-1"
      >
        <Outlet />
      </motion.main>
    </div>
  )
}
