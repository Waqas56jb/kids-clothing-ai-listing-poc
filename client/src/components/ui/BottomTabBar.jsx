import { Link, useLocation } from 'react-router-dom'
import { Home, MessageCircle, Plus, Search, User } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useCounts } from '../../lib/useCounts'

// Mobile-only bottom tab bar (Vinted/Blocket-style app navigation) shown
// under both the public and the signed-in seller layout, so the marketplace
// keeps its native-app feel regardless of login state. Sits alongside the
// existing header/sidebar navigation rather than replacing it -- this only
// surfaces the handful of things someone reaches for constantly.
function CountDot({ value }) {
  if (!value) return null
  return (
    <span className="absolute right-1 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-ink ring-2 ring-surface">
      {value > 99 ? '99+' : value}
    </span>
  )
}

export default function BottomTabBar() {
  const { session } = useAuth()
  const counts = useCounts(session)
  const location = useLocation()

  const onMarketplace = location.pathname.startsWith('/marknad')
  const searching = onMarketplace && location.search.length > 0
  const profileTarget = session ? '/dashboard' : `/login?next=${encodeURIComponent(location.pathname)}`
  const sellTarget = session ? '/upload' : '/login?mode=signup&next=%2Fupload'
  const messagesTarget = session ? '/meddelanden' : `/login?next=${encodeURIComponent('/meddelanden')}`

  const tabs = [
    { to: '/marknad', label: 'Hem', icon: Home, active: onMarketplace && !searching },
    { to: '/marknad?fokus=1', label: 'Sök', icon: Search, active: searching },
  ]
  const rightTabs = [
    { to: messagesTarget, label: 'Meddelanden', icon: MessageCircle, active: location.pathname.startsWith('/meddelanden'), count: counts.unreadMessages },
    { to: profileTarget, label: 'Profil', icon: User, active: location.pathname === '/dashboard' },
  ]

  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end border-t border-ink/5 bg-white/95 px-1 pt-2 shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.25)] backdrop-blur-xl lg:hidden"
      aria-label="Huvudnavigering"
    >
      {tabs.map((tab) => (
        <Link key={tab.label} to={tab.to} className="flex flex-col items-center gap-1 py-1">
          <tab.icon className={`h-5 w-5 ${tab.active ? 'text-ink' : 'text-ink/45'}`} strokeWidth={tab.active ? 2.25 : 1.75} />
          <span className={`text-[11px] ${tab.active ? 'font-semibold text-ink' : 'text-ink/45'}`}>{tab.label}</span>
        </Link>
      ))}

      <Link to={sellTarget} className="-mt-6 flex flex-col items-center gap-1">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-sand shadow-elevated ring-4 ring-white">
          <Plus className="h-6 w-6" strokeWidth={2.25} />
        </span>
        <span className="text-[11px] font-semibold text-ink">Sälj</span>
      </Link>

      {rightTabs.map((tab) => (
        <Link key={tab.label} to={tab.to} className="relative flex flex-col items-center gap-1 py-1">
          <span className="relative">
            <tab.icon className={`h-5 w-5 ${tab.active ? 'text-ink' : 'text-ink/45'}`} strokeWidth={tab.active ? 2.25 : 1.75} />
            <CountDot value={tab.count} />
          </span>
          <span className={`text-[11px] ${tab.active ? 'font-semibold text-ink' : 'text-ink/45'}`}>{tab.label}</span>
        </Link>
      ))}
    </nav>
  )
}
