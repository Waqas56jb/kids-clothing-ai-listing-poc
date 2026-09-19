import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Image as ImageIcon, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'react-toastify'
import { deleteGarmentImage, fileUrl, getJob, patchWorkspace } from '../../api'
import { detectionImagePath, detectionVariant, toneForCondition, toneForMatch } from '../../lib/garment'
import {
  categoryLabel,
  CATEGORY_OPTIONS,
  CONDITION_OPTIONS,
  conditionLabel as conditionKeyLabel,
  GENDER_OPTIONS,
  genderLabel,
  matchStatusLabel,
  plural,
} from '../../lib/sv'
import { approvePricing, getGarmentPricing, updatePricing } from '../../lib/pricing'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import PricingCard from '../pricing/PricingCard'

const FIELD_LABELS = {
  category: 'Kategori',
  brand: 'Märke',
  size: 'Storlek',
  color: 'Färg',
  condition: 'Skick',
  gender: 'Passar',
  defects: 'Anmärkning',
}

const REJECT_REASON_SV = {
  segmentation_failed: 'AI:n kunde inte frilägga plagget rent',
  overlaps_other_garment: 'plagget överlappar ett annat plagg',
  mask_too_small: 'frilägningen missade för mycket av plagget',
  mask_is_whole_box: 'frilägningen skilde inte plagget från bakgrunden',
  mask_has_holes: 'frilägningen fick hål i plagget',
  mask_cut_off_garment: 'frilägningen skar av delar av plagget',
  empty_mask: 'AI:n kunde inte frilägga plagget',
  ai_flagged_incomplete: 'AI:n bedömde att frilägningen inte visade hela plagget rent',
}

const inputClass =
  'rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-soft outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100'

export default function GarmentDetailPage() {
  const { jobId, detectionId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [garment, setGarment] = useState(null)
  const [form, setForm] = useState(null)
  const [pricing, setPricing] = useState(null)
  const [error, setError] = useState(null)
  const [retryKey, setRetryKey] = useState(0)
  const [showOriginal, setShowOriginal] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(null)
    getJob(jobId)
      .then((data) => {
        if (cancelled) return
        setJob(data)
        const found = data.result?.garments.find((g) => g.detection_ids.includes(detectionId))
        setGarment(found)
        if (found) {
          setForm({ ...found })
          getGarmentPricing(jobId, found)
            .then((p) => {
              if (!cancelled) setPricing(p)
            })
            .catch((err) => console.error(err))
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.error(err)
        setError(err.message || 'Kunde inte hämta plagget')
      })
    return () => {
      cancelled = true
    }
  }, [jobId, detectionId, retryKey])

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
        <EmptyState
          icon={AlertTriangle}
          title="Kunde inte visa plagget"
          description={error}
          action={<Button onClick={() => setRetryKey((k) => k + 1)}>Försök igen</Button>}
        />
      </div>
    )
  }

  if (!job || !form) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    )
  }

  if (!garment) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
        <EmptyState icon={AlertTriangle} title="Plagget hittades inte" action={<Button onClick={() => navigate(`/results/${jobId}`)}>Till resultaten</Button>} />
      </div>
    )
  }

  async function handleSave() {
    setSaving(true)
    try {
      await patchWorkspace(jobId, {
        garment_edits: {
          [garment.id]: {
            category: form.category,
            brand: form.brand || null,
            size: form.size || null,
            color: form.color || null,
            condition: form.condition || null,
            gender: form.gender || null,
            defects: form.defects || null,
          },
        },
      })
      toast.success('Ändringarna är sparade.')
    } catch (err) {
      toast.error(err.message || 'Kunde inte spara')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteImage(detectionId) {
    if (!window.confirm('Ta bort den här bilden från plagget? Den visas då inte i annonsen.')) return
    try {
      const data = await deleteGarmentImage(jobId, garment.id, detectionId)
      const refreshed = data.result?.garments.find((g) => g.id === garment.id)
      if (refreshed) {
        setJob(data)
        setGarment(refreshed)
      }
      toast.success('Bilden är borttagen.')
    } catch (err) {
      toast.error(err.message || 'Kunde inte ta bort bilden')
    }
  }

  async function handleApprovePricing() {
    const updated = await approvePricing(pricing.id)
    setPricing(updated)
    toast.success('AI:s prisförslag är nu slutpris.')
  }

  async function handleSavePricing(payload) {
    const updated = await updatePricing(pricing.id, payload)
    setPricing(updated)
    toast.success('Priset är sparat.')
  }

  const setField = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const textField = (key, placeholder = 'Okänt') => (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{FIELD_LABELS[key]}</span>
      <input value={form[key] ?? ''} onChange={setField(key)} className={inputClass} placeholder={placeholder} />
    </label>
  )

  const selectField = (key, options, labelFor, allowEmpty = true) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{FIELD_LABELS[key]}</span>
      <select value={form[key] ?? ''} onChange={setField(key)} className={inputClass}>
        {allowEmpty && <option value="">Okänt</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {labelFor(option)}
          </option>
        ))}
      </select>
    </label>
  )

  const anyOriginal = (garment.image_variants || []).some((v) => v.original)

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
      <Link to={`/results/${jobId}`} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Tillbaka till resultaten
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">{categoryLabel(garment.category)}</h1>
        <div className="flex gap-2">
          <Badge tone={toneForMatch(garment.match_status)}>{matchStatusLabel(garment.match_status)}</Badge>
          <Badge tone={toneForCondition(garment.condition, Boolean(garment.defects))}>
            {garment.defects ? 'Behöver granskas' : conditionKeyLabel(garment.condition)}
          </Badge>
        </div>
      </div>

      {garment.defects && (
        <div className="mt-4 flex gap-2.5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2} />
          <span>
            AI:n noterade möjligt slitage – kontrollera mot det fysiska plagget: <strong>{garment.defects}</strong>
          </span>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {showOriginal ? 'Originalfoton' : 'AI-bilder'}
            </p>
            {anyOriginal && (
              <button
                type="button"
                onClick={() => setShowOriginal((v) => !v)}
                className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-soft transition hover:bg-brand-50"
              >
                {showOriginal ? <Sparkles className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                {showOriginal ? 'Visa AI-bilder' : 'Visa originalfoton'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {garment.detection_ids.map((id) => {
              const variant = detectionVariant(garment, id)
              const reason = variant?.cutout_rejected_reason
              return (
                <div key={id} className="group relative overflow-hidden rounded-2xl bg-white shadow-soft">
                  <div className="aspect-square">
                    <img
                      src={fileUrl(jobId, detectionImagePath(garment, id, { original: showOriginal }))}
                      alt=""
                      className="h-full w-full object-contain p-2"
                    />
                  </div>
                  {garment.detection_ids.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteImage(id)}
                      aria-label="Ta bort bild"
                      title="Ta bort bild"
                      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-rose-600 opacity-0 shadow-soft transition hover:bg-rose-600 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  {!showOriginal && variant && (
                    <p className="border-t border-slate-100 px-2 py-1.5 text-[11px] text-slate-400">
                      {variant.display_kind === 'cutout'
                        ? 'Frilagd av AI'
                        : `Ditt originalfoto${reason ? ` – ${REJECT_REASON_SV[reason] ?? 'AI-bilden höll inte måttet'}` : ''}`}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {garment.images.length} {plural(garment.images.length, 'bild', 'bilder')} matchade till det här plagget.
            Originalfotot används alltid när AI-frilägningen inte blir ren. Håll muspekaren över en bild för att ta bort
            den om den inte hör hit.
          </p>
        </div>

        <div className="space-y-4">
          {selectField('category', CATEGORY_OPTIONS, categoryLabel, false)}
          <div className="grid grid-cols-2 gap-4">
            {textField('brand')}
            {textField('size', 't.ex. 86')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {textField('color')}
            {selectField('condition', CONDITION_OPTIONS, conditionKeyLabel)}
          </div>
          {selectField('gender', GENDER_OPTIONS, genderLabel)}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{FIELD_LABELS.defects}</span>
            <input
              value={form.defects ?? ''}
              onChange={setField('defects')}
              className={inputClass}
              placeholder="Inget slitage noterat"
            />
          </label>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Sparar…' : 'Spara ändringar'}
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/results/${jobId}`)}>
              Avbryt
            </Button>
          </div>
        </div>
      </div>

      {pricing && (
        <div className="mt-6">
          <PricingCard pricing={pricing} onApprove={handleApprovePricing} onSave={handleSavePricing} />
        </div>
      )}
    </div>
  )
}
