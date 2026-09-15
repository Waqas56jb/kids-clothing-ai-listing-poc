import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { fileUrl, getJob } from '../../api'
import { toneForMatch } from '../../lib/garment'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import { useToast } from '../ui/Toast'

function MatchCard({ garment, jobId, decision, onDecide }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white p-5 shadow-soft"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-base font-bold capitalize text-slate-800">
            {garment.category.replace(/_/g, ' ')}
          </h3>
          <Badge tone={toneForMatch(garment.match_status)}>
            {Math.round(garment.match_confidence * 100)}% match
          </Badge>
        </div>
        {decision ? (
          <Badge tone={decision === 'confirmed' ? 'good' : 'bad'}>
            {decision === 'confirmed' ? '✓ Confirmed same item' : '✕ Marked as different items'}
          </Badge>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => onDecide(garment.id, 'rejected')}>
              These are different
            </Button>
            <Button size="sm" onClick={() => onDecide(garment.id, 'confirmed')}>
              Confirm same item
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {garment.detection_ids.map((id, i) => (
          <div key={id} className="w-24">
            <div className="aspect-square overflow-hidden rounded-xl bg-surface shadow-soft">
              <img src={fileUrl(jobId, `debug/masks/${id}_masked.png`)} alt="" className="h-full w-full object-contain p-1.5" />
            </div>
            <p className="mt-1 truncate text-center text-[11px] text-slate-400">Photo {i + 1}</p>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

export default function MatchingReviewPage() {
  const { jobId } = useParams()
  const [garments, setGarments] = useState(null)
  const [decisions, setDecisions] = useState({})
  const toast = useToast()

  useEffect(() => {
    getJob(jobId).then((data) => setGarments(data.result?.garments ?? []))
  }, [jobId])

  if (garments === null) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10 space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const matched = garments.filter((g) => g.images.length > 1)
  const singles = garments.filter((g) => g.images.length === 1)

  function decide(garmentId, decision) {
    setDecisions((prev) => ({ ...prev, [garmentId]: decision }))
    toast(
      decision === 'confirmed' ? 'Marked as the same physical item.' : 'Marked as separate items — split noted.',
      'success',
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
      <Link to={`/results/${jobId}`} className="text-sm font-medium text-brand-600 hover:underline">
        ← Back to results
      </Link>
      <h1 className="mt-4 font-display text-2xl font-bold text-slate-800 sm:text-3xl">Same-Garment Matching</h1>
      <p className="mt-1 text-sm text-slate-500">
        AI groups detections it believes are the same physical item across your photos. Review each match below —
        this decision stays on this device for now and will sync to the backend in a future update.
      </p>

      <div className="mt-8 space-y-4">
        {matched.length === 0 ? (
          <EmptyState icon="🔗" title="Nothing to match" description="Every detection here is a single, distinct item." />
        ) : (
          matched.map((garment) => (
            <MatchCard
              key={garment.id}
              garment={garment}
              jobId={jobId}
              decision={decisions[garment.id]}
              onDecide={decide}
            />
          ))
        )}
      </div>

      {singles.length > 0 && (
        <div className="mt-10">
          <h2 className="font-display text-lg font-bold text-slate-800">
            Single-photo items ({singles.length})
          </h2>
          <p className="mt-1 text-sm text-slate-500">These appeared once — no matching decision needed.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {singles.map((g) => (
              <span key={g.id} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium capitalize text-slate-500 shadow-soft">
                {g.category.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
