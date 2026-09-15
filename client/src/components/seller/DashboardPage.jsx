import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'
import { CheckCircle2, FolderOpen, ImageOff, Plus, Settings2, Shirt, ShoppingBasket, Sparkles } from 'lucide-react'
import { toast } from 'react-toastify'
import { listJobs } from '../../api'
import { summarizeJobs, timeAgo, trendSeries } from '../../lib/jobsStats'
import { useAuth } from '../../auth/AuthContext'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import StatCard from '../ui/StatCard'

const STATUS_TONE = { done: 'good', processing: 'info', queued: 'neutral', error: 'bad' }

export default function DashboardPage() {
  const [jobs, setJobs] = useState(null)
  const navigate = useNavigate()
  const { profile } = useAuth()
  const firstName = profile?.full_name?.split(' ')[0]

  useEffect(() => {
    listJobs()
      .then(setJobs)
      .catch((err) => {
        console.error(err)
        toast.error(err.message || 'Could not load jobs from the server')
        setJobs([])
      })
  }, [])

  const { done, processing, totalGarments } = summarizeJobs(jobs ?? [])
  const trend = trendSeries(jobs ?? [])

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">Seller studio</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink sm:text-4xl">
            Welcome back{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
            Upload a pile of kidswear. The pipeline finds every garment, reads the labels, and readies the listing.
          </p>
        </div>
        <Button size="lg" onClick={() => navigate('/upload')}>
          <Plus className="h-4 w-4" /> New upload batch
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Batches" value={jobs?.length ?? '—'} icon={FolderOpen} tone="brand" />
        <StatCard label="Garments" value={jobs ? totalGarments : '—'} icon={Shirt} tone="emerald" />
        <StatCard label="Processing" value={jobs ? processing.length : '—'} icon={Settings2} tone="amber" />
        <StatCard label="Completed" value={jobs ? done.length : '—'} icon={CheckCircle2} tone="emerald" />
      </div>

      <Card className="mt-6 overflow-hidden p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold" />
          <h2 className="font-display text-xl font-semibold text-ink">Your yield</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">Garments detected across your recent real batches.</p>
        <div className="mt-4 h-36 sm:h-44">
          {jobs === null ? (
            <Skeleton className="h-full w-full" />
          ) : trend.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-slate-400">Upload photos to see this curve.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="sellerYield" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1d4fc7" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#1d4fc7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{ borderRadius: 16, border: '1px solid #e8eef8', fontSize: 12 }}
                />
                <Area type="monotone" dataKey="garments" name="Garments" stroke="#1d4fc7" fill="url(#sellerYield)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <h2 className="mt-10 font-display text-xl font-semibold text-ink">Recent batches</h2>

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
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sand text-brand-700">
                      <ShoppingBasket className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">
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
