import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, RotateCcw, Rocket, Tag } from 'lucide-react'
import { toast } from 'react-toastify'
import { fileUrl, getJob, patchWorkspace, publishJob } from '../../api'
import { generateDescription, generateTitle } from '../../lib/listing'
import { garmentImagePath } from '../../lib/garment'
import {
  categoryLabel,
  CATEGORY_OPTIONS,
  CONDITION_OPTIONS,
  conditionLabel,
  formatSek,
  GENDER_OPTIONS,
  genderLabel,
  listingStatusLabel,
  plural,
} from '../../lib/sv'
import { getGarmentPricing, PRICING_STATUS } from '../../lib/pricing'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import PricingStatusBadge from '../pricing/PricingStatus'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-soft outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100'

function ListingCard({ jobId, garment, index, listing, onPublish, publishing }) {
  const [title, setTitle] = useState(() => listing?.title || generateTitle(garment))
  const [description, setDescription] = useState(() => listing?.description || generateDescription(garment))
  const [attrs, setAttrs] = useState(() => ({
    category: garment.category ?? '',
    brand: garment.brand ?? '',
    size: garment.size ?? '',
    color: garment.color ?? '',
    condition: garment.condition ?? '',
    gender: garment.gender ?? '',
  }))
  const [status, setStatus] = useState(listing?.status || 'draft')
  const [listingId, setListingId] = useState(listing?.listing_id || null)
  const [pricing, setPricing] = useState(null)
  const [price, setPrice] = useState(listing?.price ?? '')

  useEffect(() => {
    let active = true
    getGarmentPricing(jobId, garment)
      .then((p) => {
        if (!active || !p) return
        setPricing(p)
        setPrice((current) => (current === '' || current == null ? (p.finalPrice ?? p.recommendedPrice ?? '') : current))
      })
      .catch((err) => console.error(err))
    return () => {
      active = false
    }
  }, [jobId, garment])

  const isFinal = pricing?.status === PRICING_STATUS.APPROVED || pricing?.status === PRICING_STATUS.MANUALLY_ADJUSTED
  const isPublished = status === 'published'

  async function saveListing(next = {}) {
    const payload = {
      title: next.title ?? title,
      description: next.description ?? description,
      status: next.status ?? status,
      price: next.price ?? (price === '' ? null : Number(price)),
    }
    if (listingId) payload.listing_id = listingId
    try {
      await patchWorkspace(jobId, { listings: { [garment.id]: payload } })
    } catch (err) {
      toast.error(err.message || 'Kunde inte spara annonsen')
    }
  }

  async function saveAttributes(nextAttrs) {
    try {
      await patchWorkspace(jobId, {
        garment_edits: {
          [garment.id]: {
            category: nextAttrs.category || null,
            brand: nextAttrs.brand || null,
            size: nextAttrs.size || null,
            color: nextAttrs.color || null,
            condition: nextAttrs.condition || null,
            gender: nextAttrs.gender || null,
          },
        },
      })
    } catch (err) {
      toast.error(err.message || 'Kunde inte spara attributen')
    }
  }

  function setAttr(key, value) {
    const next = { ...attrs, [key]: value }
    setAttrs(next)
    return next
  }

  async function handlePublish() {
    const numericPrice = price === '' ? null : Number(price)
    if (!numericPrice || numericPrice <= 0) {
      toast.warn('Ange ett pris innan du publicerar.')
      return
    }
    await saveListing({ price: numericPrice })
    const result = await onPublish(garment.id, numericPrice)
    if (result) {
      setStatus('published')
      setListingId(result.id)
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4) }}
      className="grid grid-cols-1 gap-5 rounded-2xl bg-white p-5 shadow-soft md:grid-cols-[180px_1fr]"
    >
      <div>
        <div className="aspect-square w-full overflow-hidden rounded-xl bg-surface">
          <img src={fileUrl(jobId, garmentImagePath(garment))} alt={categoryLabel(garment.category)} className="h-full w-full object-contain p-2" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isPublished ? <Badge tone="good">Publicerad</Badge> : <Badge tone="neutral">{listingStatusLabel(status)}</Badge>}
          {pricing && <PricingStatusBadge status={pricing.status} />}
        </div>
        {isPublished && listingId && (
          <Link to={`/marknad/${listingId}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
            Visa på marknaden <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Titel</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => saveListing()}
            className={`${inputClass} font-display text-base font-bold`}
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Beskrivning</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => saveListing()}
            rows={5}
            className={`${inputClass} resize-y`}
          />
        </label>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kategori</span>
            <select value={attrs.category} onChange={(e) => saveAttributes(setAttr('category', e.target.value))} className={inputClass}>
              {CATEGORY_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {categoryLabel(key)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Märke</span>
            <input value={attrs.brand} onChange={(e) => setAttr('brand', e.target.value)} onBlur={() => saveAttributes(attrs)} className={inputClass} placeholder="Okänt" />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Storlek</span>
            <input value={attrs.size} onChange={(e) => setAttr('size', e.target.value)} onBlur={() => saveAttributes(attrs)} className={inputClass} placeholder="t.ex. 86" />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Färg</span>
            <input value={attrs.color} onChange={(e) => setAttr('color', e.target.value)} onBlur={() => saveAttributes(attrs)} className={inputClass} placeholder="Okänd" />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Skick</span>
            <select value={attrs.condition} onChange={(e) => saveAttributes(setAttr('condition', e.target.value))} className={inputClass}>
              <option value="">Okänt</option>
              {CONDITION_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {conditionLabel(key)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Passar</span>
            <select value={attrs.gender} onChange={(e) => saveAttributes(setAttr('gender', e.target.value))} className={inputClass}>
              <option value="">Okänt</option>
              {GENDER_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {genderLabel(key)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {garment.defects && (
          <p className="flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            AI:n noterade möjligt slitage: {garment.defects}. Kontrollera plagget och nämn det i beskrivningen.
          </p>
        )}

        <div className="flex flex-wrap items-end gap-4 rounded-xl bg-surface/60 px-3 py-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pris (kr)</span>
            <input
              type="number"
              min="0"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              onBlur={() => saveListing()}
              className={`${inputClass} w-32 font-semibold`}
            />
          </label>
          {pricing && (
            <div className="text-xs text-slate-500">
              <p>
                AI-förslag: <span className="font-semibold text-slate-700">{formatSek(pricing.recommendedPrice)}</span>{' '}
                <span className="text-slate-400">
                  (intervall {pricing.minPrice}–{pricing.maxPrice} kr)
                </span>
              </p>
              <p>
                {isFinal ? (
                  <>
                    Godkänt pris: <span className="font-semibold text-slate-700">{formatSek(pricing.finalPrice)}</span>
                  </>
                ) : (
                  'Inget slutpris godkänt än – priset ovan används vid publicering.'
                )}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handlePublish} disabled={publishing}>
            <Rocket className="h-3.5 w-3.5" /> {isPublished ? 'Uppdatera på marknaden' : 'Publicera'}
          </Button>
          {!isPublished && (
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                setStatus('approved')
                await saveListing({ status: 'approved' })
                toast.success('Annonsen är godkänd och sparad.')
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Godkänn utkast
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const nextTitle = generateTitle(garment)
              const nextDescription = generateDescription(garment)
              setTitle(nextTitle)
              setDescription(nextDescription)
              await saveListing({ title: nextTitle, description: nextDescription })
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Återställ AI-text
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

export default function ListingPreviewPage() {
  const { jobId } = useParams()
  const [garments, setGarments] = useState(null)
  const [listings, setListings] = useState({})
  const [error, setError] = useState(null)
  const [retryKey, setRetryKey] = useState(0)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(null)
    getJob(jobId)
      .then((data) => {
        if (cancelled) return
        setGarments(data.result?.garments ?? [])
        setListings(data.workspace?.listings ?? {})
      })
      .catch((err) => {
        if (cancelled) return
        console.error(err)
        setError(err.message || 'Kunde inte hämta omgången')
      })
    return () => {
      cancelled = true
    }
  }, [jobId, retryKey])

  const publishedCount = useMemo(() => Object.values(listings).filter((l) => l?.status === 'published').length, [listings])

  async function publishOne(garmentId, price) {
    setPublishing(true)
    try {
      const data = await publishJob(jobId, { garmentIds: [garmentId], prices: { [garmentId]: price } })
      setListings(data.workspace?.listings ?? listings)
      toast.success('Annonsen är publicerad på marknaden.')
      return data.listings?.[0] ?? null
    } catch (err) {
      toast.error(err.message || 'Kunde inte publicera')
      return null
    } finally {
      setPublishing(false)
    }
  }

  async function publishAll() {
    setPublishing(true)
    try {
      const data = await publishJob(jobId, {})
      setListings(data.workspace?.listings ?? listings)
      toast.success(`${data.listings?.length ?? 0} annonser publicerade.`)
      setRetryKey((k) => k + 1)
    } catch (err) {
      toast.error(err.message || 'Kunde inte publicera')
    } finally {
      setPublishing(false)
    }
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
        <EmptyState icon={AlertTriangle} title="Kunde inte visa omgången" description={error} action={<Button onClick={() => setRetryKey((k) => k + 1)}>Försök igen</Button>} />
      </div>
    )
  }

  if (garments === null) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10 space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
      <Link to={`/results/${jobId}`} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Tillbaka till resultaten
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">Annonser</h1>
          <p className="mt-1 text-sm text-slate-500">
            AI:n har skrivit svenska titlar och beskrivningar utifrån det den faktiskt såg. Redigera fritt, sätt pris
            och publicera – inget går live förrän du trycker på Publicera.
          </p>
        </div>
        {garments.length > 0 && (
          <Button onClick={publishAll} disabled={publishing}>
            <Rocket className="h-4 w-4" /> Publicera alla ({garments.length})
          </Button>
        )}
      </div>
      {publishedCount > 0 && (
        <p className="mt-3 text-sm text-emerald-700">
          {publishedCount} av {garments.length} {plural(garments.length, 'plagg', 'plagg')} {publishedCount === 1 ? 'är publicerat' : 'är publicerade'} på{' '}
          <Link to="/marknad" className="font-semibold underline">
            marknaden
          </Link>
          .
        </p>
      )}

      <div className="mt-8 space-y-4">
        {garments.length === 0 ? (
          <EmptyState icon={Tag} title="Inget att annonsera" description="Inga plagg hittades i den här omgången." />
        ) : (
          garments.map((garment, index) => (
            <ListingCard
              key={`${garment.id}-${listings[garment.id]?.listing_id ?? ''}`}
              jobId={jobId}
              garment={garment}
              index={index}
              listing={listings[garment.id]}
              onPublish={publishOne}
              publishing={publishing}
            />
          ))
        )}
      </div>
    </div>
  )
}
