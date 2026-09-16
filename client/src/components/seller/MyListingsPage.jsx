import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, ExternalLink, HandCoins, Heart, Tag, X } from 'lucide-react'
import { toast } from 'react-toastify'
import { myFavorites, myListings, myOffers, respondOffer, storageUrl, unfavoriteListing, updateListing } from '../../api'
import { categoryLabel, formatSek, listingStatusLabel, offerStatusLabel, plural, timeAgoSv } from '../../lib/sv'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import ListingCard from '../marketplace/ListingCard'

const TABS = [
  { key: 'annonser', label: 'Mina annonser', icon: Tag },
  { key: 'bud', label: 'Bud & köp', icon: HandCoins },
  { key: 'favoriter', label: 'Favoriter', icon: Heart },
]

const STATUS_TONE = { published: 'good', sold: 'info', unpublished: 'neutral' }
const OFFER_TONE = { pending: 'ok', accepted: 'good', declined: 'bad', cancelled: 'neutral' }

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
          {[categoryLabel(listing.category), listing.size ? `stl ${listing.size}` : null, listing.brand].filter(Boolean).join(' · ')} ·{' '}
          publicerad {timeAgoSv(listing.created_at)}
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
              className="w-24 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold shadow-soft outline-none focus:border-brand-400"
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
          {listing.status !== 'published' && (
            <Button size="sm" disabled={busy} onClick={() => patch({ status: 'published' }, 'Annonsen är publicerad igen.')}>
              Publicera igen
            </Button>
          )}
          <Link to={`/marknad/${listing.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
            Visa <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </Card>
  )
}

function OfferRow({ offer, mine, onChange }) {
  const [busy, setBusy] = useState(false)
  async function act(action) {
    setBusy(true)
    try {
      onChange(await respondOffer(offer.id, action))
      toast.success(action === 'accept' ? 'Budet är accepterat – annonsen markeras som såld.' : action === 'decline' ? 'Budet är avböjt.' : 'Budet är tillbakadraget.')
    } catch (err) {
      toast.error(err.message || 'Kunde inte uppdatera budet')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <Link to={`/marknad/${offer.listing_id}`} className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-sand">
        {offer.listing_cover && <img src={storageUrl(offer.listing_cover)} alt="" className="h-full w-full object-contain p-1" />}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-ink">{offer.listing_title}</p>
          <Badge tone={OFFER_TONE[offer.status] ?? 'neutral'}>{offerStatusLabel(offer.status)}</Badge>
          <Badge tone="info">{offer.kind === 'buy' ? 'Köp' : 'Bud'}</Badge>
        </div>
        <p className="text-sm text-slate-600">
          <strong>{formatSek(offer.amount)}</strong>
          {offer.listing_price ? ` (begärt ${formatSek(offer.listing_price)})` : ''} ·{' '}
          {mine ? `till ${offer.seller_name?.split(' ')[0] ?? 'säljaren'}` : `från ${offer.buyer_name?.split(' ')[0] ?? 'köpare'}`} ·{' '}
          {timeAgoSv(offer.created_at)}
        </p>
        {offer.message && <p className="mt-1 text-sm italic text-slate-500">"{offer.message}"</p>}
      </div>
      {offer.status === 'pending' && (
        <div className="flex gap-2">
          {mine ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => act('cancel')}>
              <X className="h-3.5 w-3.5" /> Dra tillbaka
            </Button>
          ) : (
            <>
              <Button size="sm" disabled={busy} onClick={() => act('accept')}>
                <Check className="h-3.5 w-3.5" /> Acceptera
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => act('decline')}>
                <X className="h-3.5 w-3.5" /> Avböj
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  )
}

export default function MyListingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get('flik')) ? params.get('flik') : 'annonser'
  const [listings, setListings] = useState(null)
  const [offers, setOffers] = useState(null)
  const [favorites, setFavorites] = useState(null)

  useEffect(() => {
    let cancelled = false
    const fail = (err) => toast.error(err.message || 'Kunde inte hämta')
    if (tab === 'annonser' && listings === null) myListings().then((d) => !cancelled && setListings(d)).catch(fail)
    if (tab === 'bud' && offers === null) myOffers().then((d) => !cancelled && setOffers(d)).catch(fail)
    if (tab === 'favoriter' && favorites === null) myFavorites().then((d) => !cancelled && setFavorites(d)).catch(fail)
    return () => {
      cancelled = true
    }
  }, [tab, listings, offers, favorites])

  const replaceOffer = (updated) =>
    setOffers((prev) =>
      prev
        ? {
            received: prev.received.map((o) => (o.id === updated.id ? updated : o)),
            sent: prev.sent.map((o) => (o.id === updated.id ? updated : o)),
          }
        : prev,
    )

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
      <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">Mina annonser</h1>
      <p className="mt-1 text-sm text-slate-500">Publicerade plagg, inkomna bud och sparade favoriter – allt på ett ställe.</p>

      <div className="mt-6 inline-flex gap-1 rounded-xl bg-slate-100 p-1">
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
              <h2 className="font-display text-lg font-semibold text-ink">
                Inkomna bud och köp ({offers.received.length})
              </h2>
              {offers.received.length === 0 ? (
                <p className="text-sm text-slate-500">Inga bud på dina annonser än.</p>
              ) : (
                offers.received.map((offer) => <OfferRow key={offer.id} offer={offer} mine={false} onChange={replaceOffer} />)
              )}
              <h2 className="pt-6 font-display text-lg font-semibold text-ink">
                Mina bud och köp ({offers.sent.length})
              </h2>
              {offers.sent.length === 0 ? (
                <p className="text-sm text-slate-500">Du har inte lagt några bud än.</p>
              ) : (
                offers.sent.map((offer) => <OfferRow key={offer.id} offer={offer} mine onChange={replaceOffer} />)
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
