import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal, Store, X } from 'lucide-react'
import { toast } from 'react-toastify'
import { favoriteListing, listMarketplace, unfavoriteListing } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { categoryLabel, CATEGORY_OPTIONS, CONDITION_OPTIONS, conditionLabel, plural } from '../../lib/sv'
import ListingCard from './ListingCard'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

const selectClass =
  'rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-soft outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100'

export default function MarketplacePage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [showFilters, setShowFilters] = useState(false)

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

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-moss">Marknaden</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">Begagnade barnkläder</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-600">
            Bläddra, sök och filtrera fritt. Skapa ett konto först när du vill köpa, lägga bud eller spara en favorit.
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            update({ q: query.trim() })
          }}
          className="flex w-full gap-2 md:w-auto"
        >
          <div className="relative flex-1 md:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Sök märke, plagg, färg…"
              className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm shadow-soft outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
            />
          </div>
          <button type="submit" className="rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-sand transition hover:bg-moss">
            Sök
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-ink shadow-soft md:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" /> Filter{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </button>
        </form>
      </div>

      <div className={`mt-6 flex-wrap gap-3 ${showFilters ? 'flex' : 'hidden md:flex'}`}>
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
        {(activeFilterCount > 0 || filters.q) && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setParams(new URLSearchParams())
            }}
            className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 hover:text-ink"
          >
            <X className="h-4 w-4" /> Rensa
          </button>
        )}
      </div>

      {error ? (
        <div className="mt-8">
          <EmptyState icon={Store} title="Kunde inte hämta annonser" description={error} />
        </div>
      ) : data === null ? (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/6] w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Store}
            title="Inga annonser matchar"
            description={filters.q || activeFilterCount ? 'Prova att ändra sökningen eller filtren.' : 'Inga plagg är publicerade än – kom tillbaka snart.'}
          />
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-slate-500">
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
