import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Baby, Layers, MoreHorizontal, Search, Shirt, SlidersHorizontal, Sparkles, Store, Umbrella, X } from 'lucide-react'
import { toast } from 'react-toastify'
import { favoriteListing, listMarketplace, unfavoriteListing } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { CATEGORY_GROUPS, categoryLabel, CATEGORY_OPTIONS, CONDITION_OPTIONS, conditionLabel, plural } from '../../lib/sv'
import ListingCard from './ListingCard'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

const selectClass =
  'rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-soft outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100'

// Circle-icon "quick browse" strip, Vinted/Blocket-style: one tap into a
// whole group of related categories instead of an exact single one.
const GROUP_ICONS = { tops: Shirt, bottoms: Layers, dresses: Sparkles, bodies: Baby, outerwear: Umbrella }
const GROUP_TONES = {
  tops: 'bg-moss-soft text-moss',
  bottoms: 'bg-brand-50 text-brand-700',
  dresses: 'bg-rose-50 text-rose-600',
  bodies: 'bg-emerald-50 text-emerald-700',
  outerwear: 'bg-amber-50 text-amber-700',
}

export default function MarketplacePage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [showFilters, setShowFilters] = useState(false)
  const searchInputRef = useRef(null)

  // The bottom tab bar's "Sök" tab lands here with ?fokus=1 to jump straight
  // into the search box, since there's no separate search screen to open.
  useEffect(() => {
    if (params.get('fokus')) {
      searchInputRef.current?.focus()
      const next = new URLSearchParams(params)
      next.delete('fokus')
      setParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filters = useMemo(
    () => ({
      q: params.get('q') ?? '',
      category: params.get('kategori') ?? '',
      size: params.get('storlek') ?? '',
      condition: params.get('skick') ?? '',
      min_price: params.get('min') ?? '',
      max_price: params.get('max') ?? '',
      sort: params.get('sortera') ?? 'newest',
    }),
    [params],
  )

  useEffect(() => {
    let cancelled = false
    setError(null)
    listMarketplace(filters)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Kunde inte hämta annonser')
      })
    return () => {
      cancelled = true
    }
  }, [filters, session])

  function update(changes) {
    const next = new URLSearchParams(params)
    const keyMap = { q: 'q', category: 'kategori', size: 'storlek', condition: 'skick', min_price: 'min', max_price: 'max', sort: 'sortera' }
    for (const [key, value] of Object.entries(changes)) {
      const param = keyMap[key]
      if (value) next.set(param, value)
      else next.delete(param)
    }
    setParams(next)
  }

  function toggleGroup(group) {
    const joined = group.categories.join(',')
    update({ category: filters.category === joined ? '' : joined })
  }

  function clearAll() {
    setQuery('')
    setParams(new URLSearchParams())
  }

  async function toggleFavorite(listing) {
    if (!session) {
      navigate(`/login?next=${encodeURIComponent('/marknad')}`)
      return
    }
    try {
      if (listing.is_favorite) await unfavoriteListing(listing.id)
      else await favoriteListing(listing.id)
      setData((prev) =>
        prev
          ? { ...prev, items: prev.items.map((item) => (item.id === listing.id ? { ...item, is_favorite: !listing.is_favorite } : item)) }
          : prev,
      )
    } catch (err) {
      toast.error(err.message || 'Kunde inte spara favoriten')
    }
  }

  const items = data?.items ?? []
  const facets = data?.facets ?? { categories: [], sizes: [] }
  const activeFilterCount = ['category', 'size', 'condition', 'min_price', 'max_price'].filter((key) => filters[key]).length
  const hasActiveFilters = activeFilterCount > 0 || Boolean(filters.q)
  const activeGroup = CATEGORY_GROUPS.find((group) => group.categories.join(',') === filters.category)
  const sectionTitle = filters.q ? `Sökresultat för "${filters.q}"` : activeGroup ? activeGroup.label : 'Populärt just nu'

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          update({ q: query.trim() })
        }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchInputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Sök bland tusentals barnkläder…"
          className="w-full rounded-full border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-base text-ink shadow-soft outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
        />
        {/* Enter submits the search; no button needed inside an already-busy pill. */}
        <button type="submit" className="sr-only">
          Sök
        </button>
      </form>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-sand hover:text-ink"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Fler filter{activeFilterCount ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:justify-center sm:gap-6 sm:px-0">
        {CATEGORY_GROUPS.map((group) => {
          const Icon = GROUP_ICONS[group.key] ?? Shirt
          const active = activeGroup?.key === group.key
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => toggleGroup(group)}
              className="flex shrink-0 flex-col items-center gap-1.5"
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-full transition ${GROUP_TONES[group.key]} ${
                  active ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''
                }`}
              >
                <Icon className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <span className={`text-xs font-medium ${active ? 'text-ink' : 'text-slate-500'}`}>{group.label}</span>
            </button>
          )
        })}
        <button type="button" onClick={() => setShowFilters(true)} className="flex shrink-0 flex-col items-center gap-1.5">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <MoreHorizontal className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <span className="text-xs font-medium text-slate-500">Alla kategorier</span>
        </button>
      </div>

      <div className={`mt-6 flex-wrap gap-3 rounded-2xl ${showFilters ? 'flex' : 'hidden'}`}>
        <select value={filters.category} onChange={(e) => update({ category: e.target.value })} className={selectClass}>
          <option value="">Alla kategorier</option>
          {(facets.categories.length ? facets.categories.map((c) => c.category) : CATEGORY_OPTIONS).map((key) => (
            <option key={key} value={key}>
              {categoryLabel(key)}
            </option>
          ))}
        </select>
        <select value={filters.size} onChange={(e) => update({ size: e.target.value })} className={selectClass}>
          <option value="">Alla storlekar</option>
          {facets.sizes.map((s) => (
            <option key={s.size} value={s.size}>
              stl {s.size} ({s.count})
            </option>
          ))}
        </select>
        <select value={filters.condition} onChange={(e) => update({ condition: e.target.value })} className={selectClass}>
          <option value="">Alla skick</option>
          {CONDITION_OPTIONS.map((key) => (
            <option key={key} value={key}>
              {conditionLabel(key)}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min="0"
            placeholder="Min kr"
            value={filters.min_price}
            onChange={(e) => update({ min_price: e.target.value })}
            className={`${selectClass} w-24`}
          />
          <span className="text-slate-400">–</span>
          <input
            type="number"
            min="0"
            placeholder="Max kr"
            value={filters.max_price}
            onChange={(e) => update({ max_price: e.target.value })}
            className={`${selectClass} w-24`}
          />
        </div>
        <select value={filters.sort} onChange={(e) => update({ sort: e.target.value })} className={selectClass}>
          <option value="newest">Nyast först</option>
          <option value="price_asc">Lägst pris</option>
          <option value="price_desc">Högst pris</option>
        </select>
      </div>

      <div className="mt-8 flex items-end justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">{sectionTitle}</h2>
        {hasActiveFilters && (
          <button type="button" onClick={clearAll} className="flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
            Visa alla <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {error ? (
        <div className="mt-8">
          <EmptyState icon={Store} title="Kunde inte hämta annonser" description={error} />
        </div>
      ) : data === null ? (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/6] w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={Store}
            title="Inga annonser matchar"
            description={hasActiveFilters ? 'Prova att ändra sökningen eller filtren.' : 'Inga plagg är publicerade än – kom tillbaka snart.'}
          />
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-500">
            {items.length} {plural(items.length, 'annons', 'annonser')}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((listing, index) => (
              <ListingCard key={listing.id} listing={listing} index={index} onToggleFavorite={toggleFavorite} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
