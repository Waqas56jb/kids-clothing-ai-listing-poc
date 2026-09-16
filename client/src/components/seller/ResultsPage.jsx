import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, Info, Link2, Package, PackageX, Tag } from 'lucide-react'
import { getJob } from '../../api'
import GarmentCard from './GarmentCard'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

function SummaryPill({ label, count, tone }) {
  if (count === 0) return null
  const dot = { good: 'bg-emerald-500', ok: 'bg-amber-500', bad: 'bg-rose-500' }[tone]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-soft">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {count} {label}
    </span>
  )
}

export default function ResultsPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const load = () =>
      getJob(jobId)
        .then((data) => {
          if (cancelled) return
          if (!data?.result && data?.status === 'error') {
            setError(data.error || 'This batch failed while processing.')
            setLoading(false)
            return
          }
          if (!data?.result) {
            if (data?.status === 'processing' || data?.status === 'queued') {
              setError(null)
              setLoading(true)
              return
            }
            setError('No results yet for this batch. Open Dashboard and open it again once processing finishes.')
            setLoading(false)
            return
          }
          setResult(data.result)
          setLoading(false)
        })
        .catch((err) => {
          if (cancelled) return
          console.error(err)
          const message = err.message || 'Could not load this batch'
          setError(
            /not found|sign in/i.test(message)
              ? 'This batch is not available on your account. Open Dashboard to see your saved batches.'
              : message,
          )
          setLoading(false)
        })

    load()
    // While processing, keep polling so a slow interpretation still lands from Postgres.
    const poll = setInterval(() => {
      if (cancelled) return
      getJob(jobId)
        .then((data) => {
          if (cancelled || !data?.result) return
          setResult(data.result)
          setLoading(false)
          setError(null)
        })
        .catch(() => {})
    }, 4000)

    return () => {
      cancelled = true
      clearInterval(poll)
    }
  }, [jobId])

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load this batch"
          description={error}
          action={
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate('/dashboard')}>Go to dashboard</Button>
              <Button variant="secondary" onClick={() => navigate('/upload')}>
                New upload
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
        <Skeleton className="h-10 w-64" />
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full" />
          ))}
        </div>
      </div>
    )
  }

  const garments = result?.garments ?? []
  const counts = garments.reduce((acc, garment) => {
    acc[garment.match_status] = (acc[garment.match_status] ?? 0) + 1
    return acc
  }, {})
  const flaggedForDamage = garments.filter((garment) => garment.defects).length

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">
            {garments.length} Garment{garments.length === 1 ? '' : 's'} Found
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            from {result.total_images} photo{result.total_images > 1 ? 's' : ''} · {result.total_detections}{' '}
            detection{result.total_detections === 1 ? '' : 's'}
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/upload')}>
          Start new batch
        </Button>
      </div>

      {garments.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to={`/matching/${jobId}`}
            className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-soft transition hover:bg-brand-50"
          >
            <Link2 className="h-4 w-4" /> Review matching
          </Link>
          <Link
            to={`/groups/${jobId}`}
            className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-soft transition hover:bg-brand-50"
          >
            <Package className="h-4 w-4" /> Suggested groups
          </Link>
          <Link
            to={`/listings/${jobId}`}
            className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-soft transition hover:bg-brand-50"
          >
            <Tag className="h-4 w-4" /> Listing preview
          </Link>
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
        <SummaryPill label="high confidence" count={counts.high_confidence ?? 0} tone="good" />
        <SummaryPill label="medium confidence" count={counts.medium_confidence ?? 0} tone="ok" />
        <SummaryPill label="need review" count={counts.needs_review ?? 0} tone="bad" />
        <SummaryPill label="possible damage flagged" count={flaggedForDamage} tone="ok" />
      </div>

      {flaggedForDamage > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-5 flex gap-2.5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" strokeWidth={2} />
          <span>
            {flaggedForDamage} item{flaggedForDamage > 1 ? 's' : ''} {flaggedForDamage > 1 ? 'have' : 'has'} possible
            damage flagged by AI — this is a suggestion, not a verdict. Please check each one against the actual
            garment before publishing.
          </span>
        </motion.div>
      )}

      {result.notes?.length > 0 && (
        <div className="mt-3 space-y-1 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          {result.notes.map((note, index) => (
            <p key={index} className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              {note}
            </p>
          ))}
        </div>
      )}

      {garments.length === 0 ? (
        <EmptyState
          icon={PackageX}
          title="No garments detected"
          description="AI couldn't confidently detect any garments in these photos."
          action={<Button onClick={() => navigate('/upload')}>Try another batch</Button>}
        />
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {garments.map((garment, index) => (
            <GarmentCard key={garment.id} garment={garment} jobId={jobId} index={index} />
          ))}
        </div>
      )}
    </div>
  )
}
