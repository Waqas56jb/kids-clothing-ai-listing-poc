import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, FolderOpen, ImageOff, Plus, Settings2, Shirt, ShoppingBasket, Sparkles } from 'lucide-react'
import { listJobs } from '../../api'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import StatCard from '../ui/StatCard'

const STATUS_TONE = { done: 'good', processing: 'info', queued: 'neutral', error: 'bad' }

function timeAgo(unixSeconds) {
  const seconds = Math.max(0, Date.now() / 1000 - unixSeconds)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    listJobs()
      .then(setJobs)
      .catch(() => setJobs([]))
  }, [])

  const done = jobs?.filter((j) => j.status === 'done') ?? []
  const totalGarments = done.reduce((sum, j) => sum + (j.garment_count ?? 0), 0)
  const processing = jobs?.filter((j) => j.status === 'processing' || j.status === 'queued').length ?? 0

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Sparkles className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">Welcome back</h1>
            <p className="mt-0.5 text-sm text-slate-500">Here's what's happening with your listings.</p>
          </div>
        </div>
        <Button size="lg" onClick={() => navigate('/upload')}>
          <Plus className="h-4 w-4" /> New Upload Batch
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total batches" value={jobs?.length ?? '—'} icon={FolderOpen} tone="brand" />
        <StatCard label="Garments found" value={totalGarments} icon={Shirt} tone="emerald" />
        <StatCard label="Processing now" value={processing} icon={Settings2} tone="amber" />
        <StatCard label="Completed" value={done.length} icon={CheckCircle2} tone="emerald" />
      </div>

      <h2 className="mt-10 font-display text-lg font-bold text-slate-800">Recent batches</h2>

      {jobs === null ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={ImageOff}
            title="No batches yet"
            description="Upload your first batch of clothing photos to see AI results here."
            action={<Button onClick={() => navigate('/upload')}>Upload photos</Button>}
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {jobs.map((job, index) => (
            <motion.div
              key={job.job_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.04, 0.3) }}
            >
              <Link to={job.status === 'done' ? `/results/${job.job_id}` : `/processing/${job.job_id}`}>
                <Card hover className="flex items-center justify-between gap-4 p-4 sm:p-5">
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <ShoppingBasket className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">
                        Batch {job.job_id.slice(0, 8)} · {job.image_count} photo{job.image_count === 1 ? '' : 's'}
                      </p>
                      <p className="text-xs text-slate-400">{timeAgo(job.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {job.garment_count != null && (
                      <span className="hidden text-sm text-slate-500 sm:inline">{job.garment_count} garments</span>
                    )}
                    <Badge tone={STATUS_TONE[job.status] ?? 'neutral'}>{job.status}</Badge>
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
