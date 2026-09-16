import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, HandCoins, Heart, ShoppingBag, Store } from 'lucide-react'
import { toast } from 'react-toastify'
import { createOffer, favoriteListing, getListing, storageUrl, unfavoriteListing } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { categoryLabel, conditionLabel, formatSek, genderLabel, timeAgoSv } from '../../lib/sv'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

export default function ListingDetailPage() {
  const { listingId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const [listing, setListing] = useState(null)
  const [error, setError] = useState(null)
  const [activeImage, setActiveImage] = useState(0)
  const [offerOpen, setOfferOpen] = useState(false)
  const [offerAmount, setOfferAmount] = useState('')
  const [offerMessage, setOfferMessage] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(null)
    getListing(listingId)
      .then((data) => {
        if (cancelled) return
        setListing(data)
        setOfferAmount(String(Math.max(1, Math.round((data.price || 0) * 0.85))))
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Annonsen hittades inte')
      })
    return () => {
      cancelled = true
    }
  }, [listingId, session])

  function requireLogin() {
    navigate(`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`)
  }

  async function toggleFavorite() {
    if (!session) return requireLogin()
    try {
      if (listing.is_favorite) await unfavoriteListing(listing.id)
      else await favoriteListing(listing.id)
      setListing({ ...listing, is_favorite: !listing.is_favorite })
    } catch (err) {
      toast.error(err.message || 'Kunde inte spara favoriten')
    }
  }

  async function buyNow() {
    if (!session) return requireLogin()
    setSending(true)
    try {
      await createOffer(listing.id, { kind: 'buy', amount: listing.price })
      toast.success('Köpförfrågan skickad! Säljaren hör av sig.')
    } catch (err) {
      toast.error(err.message || 'Kunde inte skicka köpförfrågan')
    } finally {
      setSending(false)
    }
  }

  async function sendOffer(event) {
    event.preventDefault()
    if (!session) return requireLogin()
    const amount = Number(offerAmount)
    if (!amount || amount <= 0) {
      toast.warn('Ange ett belopp.')
      return
    }
    setSending(true)
    try {
      await createOffer(listing.id, { kind: 'offer', amount, message: offerMessage })
      toast.success('Ditt bud är skickat till säljaren.')
      setOfferOpen(false)
      setOfferMessage('')
    } catch (err) {
      toast.error(err.message || 'Kunde inte skicka budet')
    } finally {
      setSending(false)
    }
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-12">
        <EmptyState icon={Store} title="Annonsen hittades inte" description={error} action={<Button onClick={() => navigate('/marknad')}>Till marknaden</Button>} />
      </div>
    )
  }

  if (!listing) {
    return (
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 md:grid-cols-2">
        <Skeleton className="aspect-[4/5] w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const images = listing.images?.length ? listing.images : listing.cover_image ? [listing.cover_image] : []
  const facts = [
    ['Kategori', categoryLabel(listing.category)],
    ['Märke', listing.brand],
    ['Storlek', listing.size],
    ['Färg', listing.color],
    ['Skick', conditionLabel(listing.condition)],
    ['Passar', genderLabel(listing.gender)],
  ].filter(([, value]) => value)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link to="/marknad" className="flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Tillbaka till marknaden
      </Link>

      <div className="mt-6 grid gap-8 md:grid-cols-[1.05fr_0.95fr] lg:gap-12">
        <div>
          <motion.div
            key={activeImage}
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 1 }}
            className="aspect-[4/5] overflow-hidden rounded-[2rem] bg-sand shadow-elevated"
          >
            {images[activeImage] ? (
              <img src={storageUrl(images[activeImage])} alt={listing.title} className="h-full w-full object-contain p-4" />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">Ingen bild</div>
            )}
          </motion.div>
          {images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {images.map((path, index) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  className={`h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-sand ring-2 transition ${
                    index === activeImage ? 'ring-moss' : 'ring-transparent hover:ring-ink/20'
                  }`}
                >
                  <img src={storageUrl(path)} alt="" className="h-full w-full object-contain p-1" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-moss">{categoryLabel(listing.category)}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl">{listing.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="font-display text-3xl font-bold text-moss">{formatSek(listing.price)}</p>
            {listing.status === 'sold' && <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-sand">Såld</span>}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Säljs av {listing.seller_name ?? 'säljare'} · publicerad {timeAgoSv(listing.created_at)}
          </p>

          {listing.status === 'published' && !listing.is_mine && (
            <div className="mt-6 flex flex-wrap gap-2">
              <Button size="lg" onClick={buyNow} disabled={sending}>
                <ShoppingBag className="h-4 w-4" /> Köp nu
              </Button>
              <Button size="lg" variant="secondary" onClick={() => (session ? setOfferOpen(true) : requireLogin())}>
                <HandCoins className="h-4 w-4" /> Lägg bud
              </Button>
              <Button size="lg" variant={listing.is_favorite ? 'danger' : 'ghost'} onClick={toggleFavorite}>
                <Heart className="h-4 w-4" fill={listing.is_favorite ? 'currentColor' : 'none'} />
                {listing.is_favorite ? 'Sparad' : 'Spara'}
              </Button>
            </div>
          )}
          {listing.is_mine && (
            <div className="mt-6 rounded-2xl bg-moss-soft/60 p-4 text-sm text-ink">
              Det här är din annons.{' '}
              <Link to="/annonser" className="font-semibold underline">
                Hantera den under Mina annonser
              </Link>
              .
            </div>
          )}
          {!session && listing.status === 'published' && !listing.is_mine && (
            <p className="mt-3 text-xs text-slate-500">Du behöver ett konto för att köpa, lägga bud eller spara – att titta är gratis.</p>
          )}

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl bg-white p-5 shadow-soft">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
                <dd className="text-sm font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          {listing.defects && (
            <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
              <strong>Anmärkning från säljaren:</strong> {listing.defects}
            </p>
          )}

          <div className="mt-6">
            <h2 className="font-display text-xl font-semibold text-ink">Beskrivning</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">{listing.description}</p>
          </div>
        </div>
      </div>

      <Modal open={offerOpen} onClose={() => setOfferOpen(false)} title="Lägg ett bud">
        <form onSubmit={sendOffer} className="space-y-4">
          <p className="text-sm text-slate-500">
            Begärt pris är {formatSek(listing.price)}. Säljaren får ditt bud och kan acceptera eller avböja.
          </p>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ditt bud (kr)</span>
            <input
              type="number"
              min="1"
              value={offerAmount}
              onChange={(e) => setOfferAmount(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-soft outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meddelande (valfritt)</span>
            <textarea
              rows={3}
              value={offerMessage}
              onChange={(e) => setOfferMessage(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-soft outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
              placeholder="Hej! Kan du tänka dig …"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOfferOpen(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={sending}>
              {sending ? 'Skickar…' : 'Skicka bud'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
