import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

const NAV_LINKS = [
  { to: '/admin', label: 'Dashboard', icon: '📊', end: true },
  { to: '/admin/projects', label: 'Projects', icon: '🗂️' },
  { to: '/admin/jobs', label: 'Processing Jobs', icon: '⚙️' },
  { to: '/admin/review-queue', label: 'Review Queue', icon: '🔍' },
  { to: '/admin/groups', label: 'Groups & Packages', icon: '📦' },
  { to: '/admin/listings', label: 'Listings', icon: '🏷️' },
]

function NavItem({ to, label, icon, end, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
          isActive ? 'bg-brand-600 text-white shadow-soft' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
        }`
      }
    >
      <span className="text-base">{icon}</span>
      {label}
    </NavLink>
  )
}

function SidebarContent({ onNavigate }) {
  return (
    <>
      <div className="flex items-center gap-2 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-lg text-white shadow-soft">
          🛡️
        </span>
        <div>
          <p className="font-display text-base font-bold text-slate-800">Admin Console</p>
          <p className="text-xs text-slate-400">Kids AI Listing</p>
        </div>
      </div>
      <nav className="mt-8 flex flex-col gap-1">
        {NAV_LINKS.map((link) => (
          <NavItem key={link.to} {...link} onClick={onNavigate} />
        ))}
      </nav>
      <a
        href="/"
        className="mt-auto flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        ← Seller view
      </a>
    </>
  )
}

export default function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-1 border-r border-slate-100 bg-white p-5 lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar (slide-over) */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-slate-900/40"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="relative flex h-full w-72 flex-col gap-1 bg-white p-5 shadow-elevated"
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
            ☰
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
