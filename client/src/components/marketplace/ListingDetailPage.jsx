import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, HandCoins, Heart, Maximize2, MessageCircle, ShoppingBag, ShoppingCart, Store, Trash2 } from 'lucide-react'
import { toast } from 'react-toastify'
import {
  addToCart,
  createOffer,
  favoriteListing,
  getListing,
  sendListingMessage,
  storageUrl,
  unfavoriteListing,
  updateListing,
} from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { refreshCounts } from '../../lib/useCounts'
import { categoryLabel, conditionLabel, formatSek, genderLabel, timeAgoSv } from '../../lib/sv'
import Button from '../ui/Button'
import ImageLightbox from '../ui/ImageLightbox'
import Modal from '../ui/Modal'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

const fieldClass =
  'mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-soft outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100'

export default function ListingDetailPage() {
  const { listingId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { session, profile } = useAuth()
  const [listing, setListing] = useState(null)
  const [error, setError] = useState(null)
  const [activeImage, setActiveImage] = useState(0)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [offerOpen, setOfferOpen] = useState(false)
  const [offerAmount, setOfferAmount] = useState('')
  const [offerMessage, setOfferMessage] = useState('')
  const [messageOpen, setMessageOpen] = useState(false)
  const [messageBody, setMessageBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(null)
    getListing(listingId)
      .then((data) => {
        if (cancelled) return
        setListing(data)
        setActiveImage(0)
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

  async function putInCart({ goToCheckout }) {
    if (!session) return requireLogin()
    setSending(true)
    try {
      await addToCart(listing.id)
      refreshCounts()
      setListing({ ...listing, in_cart: true })
      if (goToCheckout) navigate('/kassa')
      else toast.success('Plagget ligger i din varukorg.')
    } catch (err) {
      toast.error(err.message || 'Kunde inte lägga i varukorgen')
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
      toast.success('Ditt bud är skickat till säljaren. Du får en notis när säljaren svarar.')
      setOfferOpen(false)
      setOfferMessage('')
      refreshCounts()
    } catch (err) {
      toast.error(err.message || 'Kunde inte skicka budet')
    } finally {
      setSending(false)
    }
  }

  async function sendMessage(event) {
    event.preventDefault()
    if (!session) return requireLogin()
    if (!messageBody.trim()) return
    setSending(true)
    try {
      await sendListingMessage(listing.id, { body: messageBody.trim() })
      toast.success('Meddelandet är skickat.')
      setMessageOpen(false)
      setMessageBody('')
      navigate(`/meddelanden?annons=${listing.id}&med=${listing.seller_id}`)
    } catch (err) {
      toast.error(err.message || 'Kunde inte skicka meddelandet')
    } finally {
      setSending(false)
    }
  }

  async function removeImage(path) {
    if (!window.confirm('Ta bort den här bilden från annonsen?')) return
    try {
      const updated = await updateListing(listing.id, { images: listing.images.filter((p) => p !== path) })
      setListing({ ...listing, ...updated })
      setActiveImage(0)
      toast.success('Bilden är borttagen.')
    } catch (err) {
      toast.error(err.message || 'Kunde inte ta bort bilden')
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
  const canManage = listing.is_mine || profile?.role === 'admin'
  const facts = [
    ['Kategori', categoryLabel(listing.category)],
    ['Märke', listing.brand],
    ['Storlek', listing.size],
    ['Färg', listing.color],
    ['Skick', conditionLabel(listing.condition)],
    ['Passar', genderLabel(listing.gender)],
  ].filter(([, value]) => value)
  const isAvailable = listing.status === 'published'
  const isReservedForMe = listing.status === 'reserved' && listing.reserved_for_me
  const priceToPay = listing.accepted_offer?.amount ?? listing.price

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link to="/marknad" className="flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Tillbaka till marknaden
      </Link>

      <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12">
        <div className="min-w-0">
          <motion.div
            key={activeImage}
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 1 }}
            className="aspect-[4/5] w-full overflow-hidden rounded-[2rem] bg-sand shadow-elevated"
          >
            {images[activeImage] ? (
              <button
                type="button"
                onClick={() => setViewerOpen(true)}
                aria-label="Visa bilden i stort format"
                className="group relative block h-full w-full cursor-zoom-in"
              >
                <img src={storageUrl(images[activeImage])} alt={listing.title} className="h-full w-full object-contain p-4" />
                <span className="pointer-events-none absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-soft transition group-hover:scale-110">
                  <Maximize2 className="h-4 w-4" />
                </span>
              </button>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">Ingen bild</div>
            )}
          </motion.div>
          {images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {images.map((path, index) => (
                <div key={path} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveImage(index)}
                    className={`h-20 w-20 overflow-hidden rounded-2xl bg-sand ring-2 transition ${
                      index === activeImage ? 'ring-moss' : 'ring-transparent hover:ring-ink/20'
                    }`}
                  >
                    <img src={storageUrl(path)} alt="" className="h-full w-full object-contain p-1" />
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => removeImage(path)}
                      aria-label="Ta bort bild"
                      className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white shadow-soft hover:bg-rose-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canManage && images.length <= 1 && <p className="mt-2 text-xs text-slate-400">En annons måste ha minst en bild.</p>}
          <ImageLightbox
            images={images.map((path) => storageUrl(path))}
            index={Math.min(activeImage, Math.max(0, images.length - 1))}
            onIndexChange={setActiveImage}
            open={viewerOpen}
            onClose={() => setViewerOpen(false)}
            alt={listing.title}
          />
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-moss">{categoryLabel(listing.category)}</p>
          <h1 className="mt-2 break-words font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl">{listing.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="font-display text-3xl font-bold text-moss">{formatSek(priceToPay)}</p>
            {isReservedForMe && listing.accepted_offer && priceToPay !== listing.price && (
              <span className="text-sm text-slate-400 line-through">{formatSek(listing.price)}</span>
            )}
            {listing.status === 'sold' && <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-sand">Såld</span>}
            {listing.status === 'reserved' && !isReservedForMe && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Reserverad</span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Säljs av {listing.seller_name ?? 'säljare'} · publicerad {timeAgoSv(listing.created_at)}
          </p>

          {isReservedForMe && (
            <div className="mt-6 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="font-semibold">Reserverad åt dig!</p>
              <p className="mt-1">Säljaren accepterade ditt bud på {formatSek(priceToPay)}. Betala i kassan för att slutföra köpet.</p>
              <Button className="mt-3" onClick={() => putInCart({ goToCheckout: true })} disabled={sending}>
                <ShoppingBag className="h-4 w-4" /> Gå till kassan
              </Button>
            </div>
          )}

          {isAvailable && !listing.is_mine && (
            <div className="mt-6 flex flex-wrap gap-2">
              <Button size="lg" onClick={() => putInCart({ goToCheckout: true })} disabled={sending}>
                <ShoppingBag className="h-4 w-4" /> Köp nu
              </Button>
              <Button size="lg" variant="secondary" onClick={() => putInCart({ goToCheckout: false })} disabled={sending || listing.in_cart}>
                <ShoppingCart className="h-4 w-4" /> {listing.in_cart ? 'Ligger i varukorgen' : 'Lägg i varukorg'}
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
          {!listing.is_mine && listing.status !== 'sold' && (
            <div className="mt-3">
              <Button variant="ghost" size="sm" onClick={() => (session ? setMessageOpen(true) : requireLogin())}>
                <MessageCircle className="h-4 w-4" /> Skicka meddelande till säljaren
              </Button>
            </div>
          )}
          {listing.is_mine && (
            <div className="mt-6 rounded-2xl bg-moss-soft/60 p-4 text-sm text-ink">
              Det här är din annons.{' '}
              <Link to="/annonser" className="font-semibold underline">
                Hantera den under Mina annonser
              </Link>
              . {canManage && images.length > 1 && 'Håll muspekaren över en miniatyr för att ta bort en bild.'}
            </div>
          )}
          {!session && isAvailable && (
            <p className="mt-3 text-xs text-slate-500">Du behöver ett konto för att köpa, lägga bud, spara eller skriva – att titta är gratis.</p>
          )}

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl bg-white p-5 shadow-soft">
            {facts.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
                <dd className="break-words text-sm font-medium text-ink">{value}</dd>
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
            <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-slate-600">{listing.description}</p>
          </div>
        </div>
      </div>

      <Modal open={offerOpen} onClose={() => setOfferOpen(false)} title="Lägg ett bud">
        <form onSubmit={sendOffer} className="space-y-4">
          <p className="text-sm text-slate-500">
            Begärt pris är {formatSek(listing.price)}. Säljaren kan acceptera, avböja eller lägga ett motbud – du får en notis.
          </p>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ditt bud (kr)</span>
            <input type="number" min="1" value={offerAmount} onChange={(e) => setOfferAmount(e.target.value)} className={fieldClass} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meddelande (valfritt)</span>
            <textarea rows={3} value={offerMessage} onChange={(e) => setOfferMessage(e.target.value)} className={fieldClass} placeholder="Hej! Kan du tänka dig …" />
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

      <Modal open={messageOpen} onClose={() => setMessageOpen(false)} title={`Fråga om ”${listing.title}”`}>
        <form onSubmit={sendMessage} className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ditt meddelande</span>
            <textarea rows={4} value={messageBody} onChange={(e) => setMessageBody(e.target.value)} className={fieldClass} placeholder="Hej! Är plagget fortfarande tillgängligt?" />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setMessageOpen(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={sending || !messageBody.trim()}>
              {sending ? 'Skickar…' : 'Skicka'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
