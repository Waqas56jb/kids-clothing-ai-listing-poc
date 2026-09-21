import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Baby,
  Bell,
  ChevronLeft,
  ChevronRight,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  PackageCheck,
  PanelLeftClose,
  ShoppingCart,
  Store,
  Tag,
  UploadCloud,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { BRAND } from '../lib/sv'
import { useCounts } from '../lib/useCounts'
import BottomTabBar from './ui/BottomTabBar'

const ADMIN_URL = import.meta.env.VITE_ADMIN_URL ?? (import.meta.env.DEV ? 'http://localhost:5174' : 'https://admin.miniplagg.com')

const NAV_LINKS = [
  { to: '/dashboard', label: 'Översikt', icon: LayoutDashboard, end: true },
  { to: '/upload', label: 'Ny uppladdning', icon: UploadCloud },
  { to: '/annonser', label: 'Mina annonser', icon: Tag },
  { to: '/annonser?flik=bud', label: 'Bud & köp', icon: HandCoins },
  { to: '/annonser?flik=ordrar', label: 'Ordrar', icon: PackageCheck },
  { to: '/notiser', label: 'Notiser', icon: Bell, badge: 'unread' },
  { to: '/meddelanden', label: 'Meddelanden', icon: MessageCircle, badge: 'unreadMessages' },
  { to: '/varukorg', label: 'Varukorg', icon: ShoppingCart, badge: 'cartCount' },
  { to: '/marknad', label: 'Marknaden', icon: Store },
]

function CountBadge({ value, className = '' }) {
  if (!value) return null
  return (
    <span className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-ink ${className}`}>
      {value > 99 ? '99+' : value}
    </span>
  )
}

function useCollapsed(key) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [key, collapsed])
  return [collapsed, setCollapsed]
}

// NavLink only compares the pathname, so the three "/annonser?flik=…" links
// would all light up together. Compare the tab query too.
function isLinkActive(to, end, location) {
  const [path, query = ''] = to.split('?')
  if (end) return location.pathname === path
  const onPath = location.pathname === path || location.pathname.startsWith(`${path}/`)
  if (!onPath) return false
  const wanted = new URLSearchParams(query).get('flik')
  if (path === '/annonser') {
    const current = new URLSearchParams(location.search).get('flik') || 'annonser'
    return (wanted || 'annonser') === current
  }
  return true
}

function NavItem({ to, label, icon: Icon, end, collapsed, onClick, count }) {
  const location = useLocation()
  const active = isLinkActive(to, end, location)
  return (
    <Link
      to={to}
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors ${
        collapsed ? 'justify-center px-0' : ''
      } ${active ? 'bg-white text-brand-800 shadow-soft' : 'text-brand-100 hover:bg-white/10 hover:text-white'}`}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      <CountBadge value={count} className={collapsed ? 'absolute -right-0.5 -top-0.5' : ''} />
    </Link>
  )
}

function SidebarBody({ collapsed, onNavigate, onToggle, counts }) {
  const { profile, user, signOut } = useAuth()
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Säljare'
  const initial = displayName.slice(0, 1).toUpperCase()

  return (
    <>
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between gap-2'} px-1`}>
        <Link to="/" className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white shadow-soft">
            <Baby className="h-5 w-5" />
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold text-white">{BRAND}</p>
              <p className="truncate text-[11px] uppercase tracking-[0.16em] text-brand-200">Säljarpanel</p>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={onToggle}
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl text-brand-100 hover:bg-white/10 hover:text-white lg:flex"
          aria-label={collapsed ? 'Visa sidomeny' : 'Dölj sidomeny'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="mt-8 flex flex-col gap-1">
        {NAV_LINKS.map(({ badge, ...link }) => (
          <NavItem key={link.to} {...link} count={badge ? counts?.[badge] : 0} collapsed={collapsed} onClick={onNavigate} />
        ))}
      </nav>

      <div className="mt-auto space-y-2">
        {!collapsed && (
          <div className="rounded-2xl bg-white/10 px-3 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/90 font-display text-sm font-semibold text-white">
                {initial}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                <p className="truncate text-[11px] text-brand-200">{user?.email}</p>
              </div>
            </div>
          </div>
        )}
        {profile?.role === 'admin' && (
          <a
            href={ADMIN_URL}
            className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-brand-200 hover:bg-white/10 hover:text-white ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <PanelLeftClose className="h-4 w-4" />
            {!collapsed && 'Adminpanel'}
          </a>
        )}
        <button
          type="button"
          onClick={signOut}
          className={`flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-brand-200 hover:bg-white/10 hover:text-white ${collapsed ? 'justify-center px-0' : ''}`}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && 'Logga ut'}
        </button>
      </div>
    </>
  )
}

export default function SellerLayout() {
  const location = useLocation()
  const { session } = useAuth()
  const counts = useCounts(session)
  const [collapsed, setCollapsed] = useCollapsed('seller-sidebar-collapsed')
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-dvh">
      <aside
        className={`relative sticky top-0 hidden h-dvh shrink-0 flex-col overflow-hidden bg-gradient-to-b from-[#2a4034] via-ink to-ink p-4 text-white transition-[width] duration-300 ease-out lg:flex ${
          collapsed ? 'w-[84px]' : 'w-[272px]'
        }`}
      >
        <div className="bg-grain pointer-events-none absolute inset-0 opacity-35" />
        <div className="pointer-events-none absolute -left-10 top-24 h-40 w-40 rounded-full bg-moss/30 blur-3xl" />
        <div className="relative flex h-full flex-col">
          <SidebarBody collapsed={collapsed} counts={counts} onToggle={() => setCollapsed((v) => !v)} />
        </div>
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-50 flex lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="relative flex h-full w-[min(18rem,86vw)] flex-col overflow-y-auto bg-gradient-to-b from-[#2a4034] to-ink p-5 text-white shadow-elevated"
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl text-brand-100 hover:bg-white/10"
                aria-label="Stäng meny"
              >
                <X className="h-5 w-5" />
              </button>
              <SidebarBody collapsed={false} counts={counts} onNavigate={() => setMobileOpen(false)} onToggle={() => setMobileOpen(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="safe-top sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/60 bg-white/70 px-4 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-ink hover:bg-sand"
            aria-label="Öppna meny"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-display text-lg font-semibold text-ink">{BRAND}</span>
          <div className="ml-auto flex items-center gap-1">
            <Link to="/notiser" className="relative flex h-11 w-11 items-center justify-center rounded-2xl text-ink hover:bg-sand" aria-label="Notiser">
              <Bell className="h-5 w-5" />
              <CountBadge value={counts.unread + counts.unreadMessages} className="absolute right-0.5 top-0.5" />
            </Link>
            <Link to="/varukorg" className="relative flex h-11 w-11 items-center justify-center rounded-2xl text-ink hover:bg-sand" aria-label="Varukorg">
              <ShoppingCart className="h-5 w-5" />
              <CountBadge value={counts.cartCount} className="absolute right-0.5 top-0.5" />
            </Link>
          </div>
        </header>

        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="flex-1 pb-20 lg:pb-0"
        >
          <Outlet />
        </motion.main>
      </div>

      <BottomTabBar />
    </div>
  )
}
