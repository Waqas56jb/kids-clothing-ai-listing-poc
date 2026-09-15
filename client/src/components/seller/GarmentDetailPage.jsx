import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { fileUrl, getJob } from '../../api'
import { toneForCondition, toneForMatch } from '../../lib/garment'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import { useToast } from '../ui/Toast'

const CONFIDENCE_FIELDS = ['category', 'brand', 'size', 'color', 'condition', 'gender']

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
  const toast = useToast()
  const [job, setJob] = useState(null)
  const [garment, setGarment] = useState(null)
  const [form, setForm] = useState(null)

  useEffect(() => {
    let cancelled = false
    getJob(jobId).then((data) => {
      if (cancelled) return
      setJob(data)
      const found = data.result?.garments.find((g) => g.detection_ids.includes(detectionId))
      setGarment(found)
      if (found) setForm({ ...found })
    })
    return () => {
      cancelled = true
    }
  }, [jobId, detectionId])

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

  function handleSave() {
    toast('Saved locally — connecting this to the backend is planned for the next milestone.', 'success')
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
      <Link to={`/results/${jobId}`} className="text-sm font-medium text-brand-600 hover:underline">
        ← Back to results
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
        <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          ⚠️ AI flagged possible damage — please verify against the physical item: <strong>{garment.defects}</strong>
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
    </div>
  )
}
