import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Baby, LayoutDashboard, LogOut, UploadCloud } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

// The admin console is now a separate app/deployment (see ../admin). In
// dev that's the second Vite server on :5174; in production it needs its
// own real URL set via VITE_ADMIN_URL once that service is deployed.
const ADMIN_URL = import.meta.env.VITE_ADMIN_URL ?? (import.meta.env.DEV ? 'http://localhost:5174' : '/admin')

const NAV_LINKS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/upload', label: 'New Upload', icon: UploadCloud },
]

export default function SellerLayout() {
  const location = useLocation()
  const { profile, user, signOut } = useAuth()
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Seller'

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-soft">
              <Baby className="h-5 w-5" strokeWidth={2} />
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
                  `flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                  }`
                }
              >
                <link.icon className="h-4 w-4" strokeWidth={2} />
                <span className="hidden sm:inline">{link.label}</span>
              </NavLink>
            ))}
            <a
              href={ADMIN_URL}
              className="ml-1 hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 sm:inline-block"
            >
              Admin →
            </a>
            <span className="ml-1 hidden max-w-[9rem] truncate text-xs font-medium text-slate-500 sm:inline">
              {displayName}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 sm:text-sm"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Log out</span>
            </button>
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
