import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, ExternalLink, HandCoins, Heart, PackageCheck, Reply, ShoppingBag, Tag, Truck, X } from 'lucide-react'
import { toast } from 'react-toastify'
import {
  counterOffer,
  listOrders,
  myFavorites,
  myListings,
  myOffers,
  respondOffer,
  shipOrderItem,
  storageUrl,
  unfavoriteListing,
  updateListing,
} from '../../api'
import { refreshCounts } from '../../lib/useCounts'
import {
  categoryLabel,
  formatDate,
  formatSek,
  listingStatusLabel,
  offerStatusLabel,
  orderItemStatusLabel,
  orderStatusLabel,
  plural,
  timeAgoSv,
} from '../../lib/sv'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import ListingCard from '../marketplace/ListingCard'

const TABS = [
  { key: 'annonser', label: 'Mina annonser', icon: Tag },
  { key: 'bud', label: 'Bud & köp', icon: HandCoins },
  { key: 'ordrar', label: 'Ordrar', icon: PackageCheck },
  { key: 'favoriter', label: 'Favoriter', icon: Heart },
]

const STATUS_TONE = { published: 'good', reserved: 'ok', sold: 'info', unpublished: 'neutral' }
const OFFER_TONE = { pending: 'ok', countered: 'info', accepted: 'good', completed: 'good', declined: 'bad', cancelled: 'neutral' }
const inputClass = 'rounded-xl border border-slate-200 px-3 py-1.5 text-sm shadow-soft outline-none focus:border-brand-400'

function ListingRow({ listing, onChange }) {
  const [price, setPrice] = useState(listing.price)
  const [busy, setBusy] = useState(false)

  async function patch(changes, message) {
    setBusy(true)
    try {
      const updated = await updateListing(listing.id, changes)
      onChange(updated)
      if (message) toast.success(message)
    } catch (err) {
      toast.error(err.message || 'Kunde inte uppdatera annonsen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <Link to={`/marknad/${listing.id}`} className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-sand">
        {listing.cover_image && <img src={storageUrl(listing.cover_image)} alt="" className="h-full w-full object-contain p-1.5" />}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-display text-lg font-semibold text-ink">{listing.title}</h3>
          <Badge tone={STATUS_TONE[listing.status] ?? 'neutral'}>{listingStatusLabel(listing.status)}</Badge>
        </div>
        <p className="text-xs text-slate-500">
          {[categoryLabel(listing.category), listing.size ? `stl ${listing.size}` : null, listing.brand].filter(Boolean).join(' · ')} · publicerad{' '}
          {timeAgoSv(listing.created_at)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Pris</span>
            <input
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={() => Number(price) !== listing.price && patch({ price: Number(price) }, 'Priset är uppdaterat.')}
              className={`${inputClass} w-24 font-semibold`}
            />
            <span className="text-slate-500">kr</span>
          </label>
          {listing.status === 'published' && (
            <>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => patch({ status: 'sold' }, 'Markerad som såld.')}>
                Markera som såld
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch({ status: 'unpublished' }, 'Annonsen är avpublicerad.')}>
                Avpublicera
              </Button>
            </>
          )}
          {listing.status === 'reserved' && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => patch({ status: 'published' }, 'Reservationen är släppt.')}>
              Släpp reservationen
            </Button>
          )}
          {(listing.status === 'sold' || listing.status === 'unpublished') && (
            <Button size="sm" disabled={busy} onClick={() => patch({ status: 'published' }, 'Annonsen är publicerad igen.')}>
              Publicera igen
            </Button>
          )}
          <Link to={`/marknad/${listing.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
            Visa & hantera bilder <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </Card>
  )
}

function OfferRow({ offer, mine, onChange }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [countering, setCountering] = useState(false)
  const [counterAmount, setCounterAmount] = useState(offer.listing_price ?? offer.amount)
  const [counterMessage, setCounterMessage] = useState('')

  async function act(action) {
    setBusy(true)
    try {
      onChange(await respondOffer(offer.id, action))
      refreshCounts()
      toast.success(
        action === 'accept'
          ? mine
            ? 'Motbudet är accepterat – plagget ligger i din varukorg.'
            : 'Budet är accepterat – köparen kan nu betala i kassan.'
          : action === 'decline'
            ? 'Budet är avböjt.'
            : 'Budet är tillbakadraget.',
      )
      if (action === 'accept' && mine) navigate('/kassa')
    } catch (err) {
      toast.error(err.message || 'Kunde inte uppdatera budet')
    } finally {
      setBusy(false)
    }
  }

  async function sendCounter(event) {
    event.preventDefault()
    setBusy(true)
    try {
      onChange(await counterOffer(offer.id, { amount: Number(counterAmount), message: counterMessage }))
      toast.success('Motbudet är skickat till köparen.')
      setCountering(false)
    } catch (err) {
      toast.error(err.message || 'Kunde inte skicka motbudet')
    } finally {
      setBusy(false)
    }
  }

  const status = offer.status
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link to={`/marknad/${offer.listing_id}`} className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-sand">
          {offer.listing_cover && <img src={storageUrl(offer.listing_cover)} alt="" className="h-full w-full object-contain p-1" />}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-ink">{offer.listing_title}</p>
            <Badge tone={OFFER_TONE[status] ?? 'neutral'}>{offerStatusLabel(status)}</Badge>
          </div>
          <p className="text-sm text-slate-600">
            Bud <strong>{formatSek(offer.amount)}</strong>
            {offer.listing_price ? ` (begärt ${formatSek(offer.listing_price)})` : ''} ·{' '}
            {mine ? `till ${offer.seller_name?.split(' ')[0] ?? 'säljaren'}` : `från ${offer.buyer_name?.split(' ')[0] ?? 'köpare'}`} · {timeAgoSv(offer.created_at)}
          </p>
          {offer.message && <p className="mt-1 text-sm italic text-slate-500">”{offer.message}”</p>}
          {status === 'countered' && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Motbud från säljaren: <strong>{formatSek(offer.counter_amount)}</strong>
              {offer.counter_message ? ` – ”${offer.counter_message}”` : ''}
            </p>
          )}
          {status === 'accepted' && (
            <p className="mt-2 text-sm text-emerald-700">
              {mine ? 'Accepterat – betala i kassan för att slutföra köpet.' : 'Accepterat – väntar på att köparen betalar.'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {status === 'pending' && mine && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => act('cancel')}>
              <X className="h-3.5 w-3.5" /> Dra tillbaka
            </Button>
          )}
          {status === 'pending' && !mine && (
            <>
              <Button size="sm" disabled={busy} onClick={() => act('accept')}>
                <Check className="h-3.5 w-3.5" /> Acceptera
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setCountering((v) => !v)}>
                <Reply className="h-3.5 w-3.5" /> Motbud
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => act('decline')}>
                <X className="h-3.5 w-3.5" /> Avböj
              </Button>
            </>
          )}
          {status === 'countered' && mine && (
            <>
              <Button size="sm" disabled={busy} onClick={() => act('accept')}>
                <Check className="h-3.5 w-3.5" /> Acceptera {formatSek(offer.counter_amount)}
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => act('decline')}>
                <X className="h-3.5 w-3.5" /> Avböj
              </Button>
            </>
          )}
          {status === 'accepted' && mine && (
            <Button size="sm" onClick={() => navigate('/kassa')}>
              <ShoppingBag className="h-3.5 w-3.5" /> Gå till kassan
            </Button>
          )}
        </div>
      </div>
      {countering && (
        <form onSubmit={sendCounter} className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl bg-sand/60 p-3">
          <label className="text-sm">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Ditt motbud (kr)</span>
            <input type="number" min="1" required value={counterAmount} onChange={(e) => setCounterAmount(e.target.value)} className={`${inputClass} mt-1 w-28 font-semibold`} />
          </label>
          <label className="min-w-[200px] flex-1 text-sm">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Meddelande (valfritt)</span>
            <input value={counterMessage} onChange={(e) => setCounterMessage(e.target.value)} className={`${inputClass} mt-1 w-full`} placeholder="Jag kan gå ner till …" />
          </label>
          <Button type="submit" size="sm" disabled={busy}>
            Skicka motbud
          </Button>
        </form>
      )}
    </Card>
  )
}

function OrderCard({ order, asSeller, onChange }) {
  const [busy, setBusy] = useState(false)
  const shipping = order.shipping || {}
  async function ship(itemId) {
    setBusy(true)
    try {
      const updated = await shipOrderItem(order.id, itemId)
      onChange({ ...order, items: order.items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)) })
      toast.success('Markerad som skickad – köparen har fått en notis.')
    } catch (err) {
      toast.error(err.message || 'Kunde inte markera som skickad')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          Order {order.id.slice(0, 8)} · {formatDate(order.created_at)}
        </p>
        <Badge tone={order.status === 'paid' ? 'good' : order.status === 'cancelled' ? 'bad' : 'ok'}>{orderStatusLabel(order.status)}</Badge>
      </div>
      <ul className="mt-3 divide-y divide-slate-100">
        {order.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-sand">
              {item.cover_image && <img src={storageUrl(item.cover_image)} alt="" className="h-full w-full object-contain p-1" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
              <span className="text-xs text-slate-500">
                {formatSek(item.price)} · {orderItemStatusLabel(item.status)}
                {asSeller ? ` · köpare: ${order.buyer_name || order.shipping?.name || '–'}` : item.seller_name ? ` · säljare: ${item.seller_name}` : ''}
              </span>
            </span>
            {asSeller && item.status === 'paid' && (
              <Button size="sm" disabled={busy} onClick={() => ship(item.id)}>
                <Truck className="h-3.5 w-3.5" /> Markera som skickad
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
        {asSeller ? (
          <p className="text-slate-600">
            <span className="font-semibold">Skicka till:</span>{' '}
            {[shipping.name, shipping.address, `${shipping.postal_code || ''} ${shipping.city || ''}`.trim(), shipping.phone, shipping.email].filter(Boolean).join(', ')}
          </p>
        ) : (
          <Link to={`/kassa/klart/${order.id}`} className="font-semibold text-brand-700 hover:underline">
            Visa orderbekräftelse
          </Link>
        )}
        <p className="font-semibold text-ink">{formatSek(order.items.reduce((sum, item) => sum + item.price, 0))}</p>
      </div>
    </Card>
  )
}

export default function MyListingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get('flik')) ? params.get('flik') : 'annonser'
  const [listings, setListings] = useState(null)
  const [offers, setOffers] = useState(null)
  const [orders, setOrders] = useState(null)
  const [favorites, setFavorites] = useState(null)

  useEffect(() => {
    let cancelled = false
    const fail = (err) => toast.error(err.message || 'Kunde inte hämta')
    if (tab === 'annonser' && listings === null) myListings().then((d) => !cancelled && setListings(d)).catch(fail)
    if (tab === 'bud' && offers === null) myOffers().then((d) => !cancelled && setOffers(d)).catch(fail)
    if (tab === 'ordrar' && orders === null) listOrders().then((d) => !cancelled && setOrders(d)).catch(fail)
    if (tab === 'favoriter' && favorites === null) myFavorites().then((d) => !cancelled && setFavorites(d)).catch(fail)
    return () => {
      cancelled = true
    }
  }, [tab, listings, offers, orders, favorites])

  const replaceOffer = (updated) =>
    setOffers((prev) =>
      prev
        ? {
            received: prev.received.map((o) => (o.id === updated.id ? updated : o)),
            sent: prev.sent.map((o) => (o.id === updated.id ? updated : o)),
          }
        : prev,
    )

  const replaceOrder = (updated, key) =>
    setOrders((prev) => (prev ? { ...prev, [key]: prev[key].map((o) => (o.id === updated.id ? updated : o)) } : prev))

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
      <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">Mina annonser</h1>
      <p className="mt-1 text-sm text-slate-500">Publicerade plagg, bud och motbud, ordrar och sparade favoriter – allt på ett ställe.</p>

      <div className="mt-6 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setParams({ flik: item.key })}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
              tab === item.key ? 'bg-white text-brand-700 shadow-soft' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <item.icon className="h-4 w-4" /> {item.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {tab === 'annonser' &&
          (listings === null ? (
            <Skeleton className="h-32 w-full" />
          ) : listings.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="Inga publicerade annonser"
              description="Gå igenom en färdig omgång och tryck på Publicera så dyker plaggen upp här och på marknaden."
              action={
                <Link to="/dashboard">
                  <Button>Till översikten</Button>
                </Link>
              }
            />
          ) : (
            listings.map((listing) => (
              <ListingRow key={listing.id} listing={listing} onChange={(updated) => setListings((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))} />
            ))
          ))}

        {tab === 'bud' &&
          (offers === null ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <>
              <h2 className="font-display text-lg font-semibold text-ink">Inkomna bud ({offers.received.length})</h2>
              {offers.received.length === 0 ? (
                <p className="text-sm text-slate-500">Inga bud på dina annonser än.</p>
              ) : (
                offers.received.map((offer) => <OfferRow key={offer.id} offer={offer} mine={false} onChange={replaceOffer} />)
              )}
              <h2 className="pt-6 font-display text-lg font-semibold text-ink">Mina bud ({offers.sent.length})</h2>
              {offers.sent.length === 0 ? (
                <p className="text-sm text-slate-500">Du har inte lagt några bud än.</p>
              ) : (
                offers.sent.map((offer) => <OfferRow key={offer.id} offer={offer} mine onChange={replaceOffer} />)
              )}
            </>
          ))}

        {tab === 'ordrar' &&
          (orders === null ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <>
              <h2 className="font-display text-lg font-semibold text-ink">Mina köp ({orders.purchases.length})</h2>
              {orders.purchases.length === 0 ? (
                <p className="text-sm text-slate-500">Du har inte köpt något än.</p>
              ) : (
                orders.purchases.map((order) => <OrderCard key={order.id} order={order} asSeller={false} onChange={(o) => replaceOrder(o, 'purchases')} />)
              )}
              <h2 className="pt-6 font-display text-lg font-semibold text-ink">Mina försäljningar ({orders.sales.length})</h2>
              {orders.sales.length === 0 ? (
                <p className="text-sm text-slate-500">Inga försäljningar än.</p>
              ) : (
                orders.sales.map((order) => <OrderCard key={order.id} order={order} asSeller onChange={(o) => replaceOrder(o, 'sales')} />)
              )}
            </>
          ))}

        {tab === 'favoriter' &&
          (favorites === null ? (
            <Skeleton className="h-32 w-full" />
          ) : favorites.length === 0 ? (
            <EmptyState icon={Heart} title="Inga favoriter" description="Tryck på hjärtat på en annons för att spara den här." />
          ) : (
            <>
              <p className="text-sm text-slate-500">
                {favorites.length} {plural(favorites.length, 'sparad annons', 'sparade annonser')}
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {favorites.map((listing, index) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    index={index}
                    onToggleFavorite={async (item) => {
                      try {
                        await unfavoriteListing(item.id)
                        setFavorites((prev) => prev.filter((l) => l.id !== item.id))
                      } catch (err) {
                        toast.error(err.message || 'Kunde inte ta bort favoriten')
                      }
                    }}
                  />
                ))}
              </div>
            </>
          ))}
      </div>
    </div>
  )
}
