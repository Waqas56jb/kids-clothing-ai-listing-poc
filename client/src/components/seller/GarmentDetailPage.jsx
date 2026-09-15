import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { toast } from 'react-toastify'
import { fileUrl, getJob, patchWorkspace } from '../../api'
import { toneForCondition, toneForMatch } from '../../lib/garment'
import { approvePricing, getGarmentPricing, updatePricing } from '../../lib/pricing'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import PricingCard from '../pricing/PricingCard'

function ConfidenceBar({ value = 0 }) {
  const pct = Math.round(value * 100)
  const tone = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <motion.div
          className={`h-full rounded-full ${tone}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <span className="text-xs font-medium text-slate-400">{pct}%</span>
    </div>
  )
}

export default function GarmentDetailPage() {
  const { jobId, detectionId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [garment, setGarment] = useState(null)
  const [form, setForm] = useState(null)
  const [pricing, setPricing] = useState(null)
  const [error, setError] = useState(null)
  const [retryKey, setRetryKey] = useState(0)

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
        setError(err.message || 'Could not load this garment')
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
          title="Couldn't load this garment"
          description={error}
          action={<Button onClick={() => setRetryKey((k) => k + 1)}>Try again</Button>}
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

  async function handleSave() {
    try {
      await patchWorkspace(jobId, {
        garment_edits: {
          [garment.id]: {
            category: form.category,
            brand: form.brand,
            size: form.size,
            color: form.color,
            condition: form.condition,
            gender: form.gender,
            defects: form.defects,
          },
        },
      })
      toast.success('Saved to the database. Admin can see these edits too.')
    } catch (err) {
      toast.error(err.message || 'Could not save')
    }
  }

  async function handleApprovePricing() {
    const updated = await approvePricing(pricing.id, { actor: 'Seller' })
    setPricing(updated)
    toast.success('AI price accepted as the final price.')
  }

  async function handleSavePricing(payload) {
    const updated = await updatePricing(pricing.id, { ...payload, actor: 'Seller' })
    setPricing(updated)
    toast.success('Custom price saved.')
  }

  const field = (key) => (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{key}</span>
        <ConfidenceBar value={garment.confidence?.[key]} />
      </span>
      <input
        value={form[key] ?? ''}
        onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
        className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-soft outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
        placeholder="Unknown"
      />
    </label>
  )

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
      <Link to={`/results/${jobId}`} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to results
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold capitalize text-slate-800 sm:text-3xl">
          {garment.category.replace(/_/g, ' ')}
        </h1>
        <div className="flex gap-2">
          <Badge tone={toneForMatch(garment.match_status)}>{garment.match_status.replace(/_/g, ' ')}</Badge>
          <Badge tone={toneForCondition(garment.condition, Boolean(garment.defects))}>
            {garment.defects ? 'Needs review' : (garment.condition ?? 'unknown')}
          </Badge>
        </div>
      </div>

      {garment.defects && (
        <div className="mt-4 flex gap-2.5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2} />
          <span>
            AI flagged possible damage — please verify against the physical item: <strong>{garment.defects}</strong>
          </span>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {garment.detection_ids.map((id) => (
              <div key={id} className="aspect-square overflow-hidden rounded-2xl bg-white shadow-soft">
                <img src={fileUrl(jobId, `debug/masks/${id}_masked.png`)} alt="" className="h-full w-full object-contain p-2" />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {garment.images.length} source photo{garment.images.length > 1 ? 's' : ''} matched to this garment
          </p>
        </div>

        <div className="space-y-4">
          {field('category')}
          <div className="grid grid-cols-2 gap-4">
            {field('brand')}
            {field('size')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('color')}
            {field('condition')}
          </div>
          {field('gender')}

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave}>Save changes</Button>
            <Button variant="secondary" onClick={() => navigate(`/results/${jobId}`)}>
              Cancel
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
