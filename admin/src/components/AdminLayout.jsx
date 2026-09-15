import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Banknote,
  FolderKanban,
  LayoutDashboard,
  Menu,
  Package,
  Search,
  Settings2,
  ShieldCheck,
  Tag,
} from 'lucide-react'

// The seller app is a separate app/deployment (see ../client). In dev
// that's the first Vite server on :5173; in production it needs its own
// real URL set via VITE_CLIENT_URL once that service is deployed.
const CLIENT_URL = import.meta.env.VITE_CLIENT_URL ?? (import.meta.env.DEV ? 'http://localhost:5173' : '/')

const NAV_LINKS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/jobs', label: 'Processing Jobs', icon: Settings2 },
  { to: '/review-queue', label: 'Review Queue', icon: Search },
  { to: '/groups', label: 'Groups & Packages', icon: Package },
  { to: '/listings', label: 'Listings', icon: Tag },
  { to: '/pricing', label: 'Pricing Engine', icon: Banknote },
]

function NavItem({ to, label, icon: Icon, end, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
          isActive ? 'bg-white text-brand-700 shadow-soft' : 'text-brand-100 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
      {label}
    </NavLink>
  )
}

function SidebarContent({ onNavigate }) {
  return (
    <>
      <div className="flex items-center gap-2 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white shadow-soft">
          <ShieldCheck className="h-5 w-5" strokeWidth={2} />
        </span>
        <div>
          <p className="font-display text-base font-bold text-white">Admin Console</p>
          <p className="text-xs text-brand-200">Kids AI Listing</p>
        </div>
      </div>
      <nav className="mt-8 flex flex-col gap-1">
        {NAV_LINKS.map((link) => (
          <NavItem key={link.to} {...link} onClick={onNavigate} />
        ))}
      </nav>
      <a
        href={CLIENT_URL}
        className="mt-auto flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-brand-200 transition-colors hover:bg-white/10 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Seller view
      </a>
    </>
  )
}

export default function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Desktop sidebar -- rich blue gradient to read as a distinct "console", not just another light page */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-1 bg-gradient-to-b from-brand-700 to-brand-900 p-5 lg:flex">
        <SidebarContent />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="relative flex h-full w-72 flex-col gap-1 bg-gradient-to-b from-brand-700 to-brand-900 p-5 shadow-elevated"
            >
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-100 bg-white/80 px-4 backdrop-blur-md sm:px-6 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-display text-base font-bold text-slate-800">Admin Console</span>
        </header>

        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="flex-1 p-4 sm:p-6 lg:p-8"
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  )
}
