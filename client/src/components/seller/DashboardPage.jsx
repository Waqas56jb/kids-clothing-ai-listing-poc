import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  ArrowUpRight,
  CheckCircle2,
  FolderOpen,
  ImageOff,
  Plus,
  Settings2,
  Shirt,
  ShoppingBasket,
  Sparkles,
} from 'lucide-react'
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

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  }),
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState(null)
  const navigate = useNavigate()
  const { profile, loading, session } = useAuth()
  const firstName = profile?.full_name?.split(' ')[0]

  useEffect(() => {
    if (loading) return
    if (!session) {
      setJobs([])
      return
    }
    listJobs()
      .then(setJobs)
      .catch((err) => {
        console.error(err)
        toast.error(err.message || 'Could not load jobs from the server')
        setJobs([])
      })
  }, [loading, session])

  const { done, processing, totalGarments } = summarizeJobs(jobs ?? [])
  const trend = trendSeries(jobs ?? [])

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:py-12">
      <motion.section
        initial="hidden"
        animate="show"
        variants={fadeUp}
        className="relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-ink text-white shadow-elevated"
      >
        <img
          src="/landing/hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-moss/55" />
        <div className="bg-grain pointer-events-none absolute inset-0 opacity-25" />

        <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between lg:p-10">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">Seller studio</p>
            <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl lg:text-[2.75rem]">
              Welcome back{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/65 sm:text-base">
              Upload a pile of kidswear. The pipeline finds every garment, reads the labels, and readies the listing.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => navigate('/upload')}
            className="!rounded-full !bg-sand !text-ink hover:!bg-white shrink-0"
          >
            <Plus className="h-4 w-4" /> New upload batch
          </Button>
        </div>
      </motion.section>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:mt-8 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Batches" value={jobs?.length ?? '—'} icon={FolderOpen} tone="brand" />
        <StatCard label="Garments" value={jobs ? totalGarments : '—'} icon={Shirt} tone="emerald" />
        <StatCard label="Processing" value={jobs ? processing.length : '—'} icon={Settings2} tone="amber" />
        <StatCard label="Completed" value={jobs ? done.length : '—'} icon={CheckCircle2} tone="emerald" />
      </div>

      <div className="mt-6 grid gap-4 lg:mt-8 lg:grid-cols-[1.4fr_1fr] lg:gap-5">
        <Card className="overflow-hidden p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-gold" />
                <h2 className="font-display text-xl font-semibold text-ink">Your yield</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">Garments detected across recent batches.</p>
            </div>
          </div>
          <div className="mt-4 h-40 sm:h-48">
            {jobs === null ? (
              <Skeleton className="h-full w-full" />
            ) : trend.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl bg-sand/50 text-sm text-slate-400">
                Upload photos to see this curve.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sellerYield" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3d5c4a" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#3d5c4a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip contentStyle={{ borderRadius: 16, border: '1px solid #e8eef8', fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="garments"
                    name="Garments"
                    stroke="#3d5c4a"
                    fill="url(#sellerYield)"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="flex flex-col justify-between overflow-hidden p-5 sm:p-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">Next step</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">Keep the pipeline moving</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Drop a new batch whenever you have photos ready. Results land here as soon as processing finishes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/upload')}
            className="mt-6 flex items-center justify-between rounded-2xl border border-moss/15 bg-moss-soft/60 px-4 py-3.5 text-left transition hover:bg-moss-soft"
          >
            <span>
              <span className="block text-sm font-semibold text-ink">Start a new upload</span>
              <span className="text-xs text-slate-500">Multi-photo batches supported</span>
            </span>
            <ArrowUpRight className="h-5 w-5 text-moss" />
          </button>
        </Card>
      </div>

      <div className="mt-8 flex items-end justify-between gap-3 sm:mt-10">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">Recent batches</h2>
          <p className="mt-1 text-sm text-slate-500">Newest work first.</p>
        </div>
      </div>

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
              custom={index}
              initial="hidden"
              animate="show"
              variants={fadeUp}
            >
              <Link to={job.status === 'done' ? `/results/${job.job_id}` : `/processing/${job.job_id}`}>
                <Card hover className="flex items-center justify-between gap-4 p-4 sm:p-5">
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-moss-soft text-moss">
                      <ShoppingBasket className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">
                        Batch {job.job_id.slice(0, 8)} · {job.image_count} photo
                        {job.image_count === 1 ? '' : 's'}
                      </p>
                      <p className="text-xs text-slate-400">{timeAgo(job.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {job.garment_count != null && (
                      <span className="hidden text-sm text-slate-500 sm:inline">
                        {job.garment_count} garments
                      </span>
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
