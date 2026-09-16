import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle, Camera, FolderKanban, Package, Search, Settings2, Shirt, Tag } from 'lucide-react'
import { toast } from 'react-toastify'
import { listJobs } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { statusSeries, summarizeJobs, timeAgo, trendSeries } from '../../lib/jobsStats'
import StatCard from '../ui/StatCard'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Skeleton from '../ui/Skeleton'
import Loader from '../ui/Loader'

const STATUS_TONE = { done: 'good', processing: 'info', queued: 'neutral', error: 'bad' }
const asset = (path) => `${import.meta.env.BASE_URL}${String(path).replace(/^\//, '')}`

const tooltipStyle = {
  borderRadius: 16,
  border: '1px solid #e8eef8',
  boxShadow: '0 12px 32px rgb(20 24 31 / 0.08)',
  fontSize: 12,
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  }),
}

function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <Card className={`p-5 sm:p-6 ${className}`}>
      <div className="mb-4">
        <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </Card>
  )
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState(null)
  const { loading, session, profile } = useAuth()
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

  if (jobs === null) {
    return (
      <div>
        <Skeleton className="h-36 w-full rounded-[1.75rem]" />
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Loader label="Loading live operations…" />
      </div>
    )
  }

  const { done, errored, processing, totalGarments, totalPhotos } = summarizeJobs(jobs)
  const trend = trendSeries(jobs)
  const mix = statusSeries(jobs)
  const avgGarments = done.length ? Math.round((totalGarments / done.length) * 10) / 10 : 0

  return (
    <div className="mx-auto w-full max-w-7xl">
      <motion.section
        initial="hidden"
        animate="show"
        variants={fadeUp}
        className="relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-ink text-white shadow-elevated"
      >
        <img
          src={asset('landing/hero.jpg')}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-brand-900/80 to-ink/70" />
        <div className="bg-grain pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative p-6 sm:p-8 lg:p-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">Operations</p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">
            {firstName ? `${firstName}, here’s the system` : 'System overview'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65 sm:text-base">
            Live snapshot of every seller batch — photos in, garments out, and work still in the pipeline.
          </p>
        </div>
      </motion.section>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:mt-8 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Projects" value={jobs.length} hint="All seller batches" icon={FolderKanban} tone="brand" />
        <StatCard label="Photos" value={totalPhotos} hint="Images through the model" icon={Camera} tone="brand" />
        <StatCard
          label="Garments"
          value={totalGarments}
          hint={`${avgGarments || 0} avg per completed batch`}
          icon={Shirt}
          tone="emerald"
        />
        <StatCard
          label="In flight"
          value={processing.length}
          hint={`${errored.length} failed`}
          icon={Settings2}
          tone="amber"
        />
      </div>

      {errored.length > 0 && (
        <div className="mt-6 flex items-start gap-2.5 rounded-3xl border border-rose-100 bg-rose-50/80 p-4 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {errored.length} project{errored.length > 1 ? 's' : ''} failed processing.{' '}
            <Link to="/jobs" className="font-semibold underline underline-offset-2">
              Open jobs monitor
            </Link>
          </span>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:mt-8 lg:gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard title="Throughput" subtitle="Photos and garments from real batches, oldest to newest.">
            <div className="h-64 sm:h-72">
              {trend.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-2xl bg-sand/40 text-sm text-slate-400">
                  No batches yet — charts fill as jobs complete.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gPhotos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1d4fc7" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#1d4fc7" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gGarments" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3d5c4a" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#3d5c4a" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e8eef8" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="photos" name="Photos" stroke="#1d4fc7" fill="url(#gPhotos)" strokeWidth={2.5} />
                    <Area type="monotone" dataKey="garments" name="Garments" stroke="#3d5c4a" fill="url(#gGarments)" strokeWidth={2.5} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </ChartCard>
        </div>

        <ChartCard title="Pipeline mix" subtitle="Share of batches by live status.">
          <div className="h-64 sm:h-72">
            {mix.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl bg-sand/40 text-sm text-slate-400">
                Waiting for the first job.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={mix} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={4} stroke="none">
                    {mix.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <ul className="mt-1 flex flex-wrap gap-3 text-xs font-medium text-slate-500">
            {mix.map((item) => (
              <li key={item.name} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: item.fill }} />
                {item.name} · {item.value}
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-5 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Batch comparison" subtitle="Photos uploaded vs garments found on recent jobs.">
          <div className="h-60">
            {trend.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl bg-sand/40 text-sm text-slate-400">
                No comparison data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#e8eef8" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="photos" name="Photos" fill="#86b0ff" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="garments" name="Garments" fill="#1d4fc7" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        <div>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink">Recent projects</h2>
              <p className="mt-1 text-sm text-slate-500">Newest seller batches first.</p>
            </div>
            <Link to="/projects" className="text-sm font-semibold text-brand-700 hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {jobs.length === 0 ? (
              <Card className="p-6 text-center text-sm text-slate-400">No projects yet.</Card>
            ) : (
              jobs.slice(0, 5).map((job, i) => (
                <motion.div key={job.job_id} custom={i} initial="hidden" animate="show" variants={fadeUp}>
                  <Link to={`/projects/${job.job_id}`}>
                    <Card hover className="flex items-center justify-between gap-3 p-3.5 sm:p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {job.job_id.slice(0, 10)} · {job.image_count} photos
                        </p>
                        <p className="text-xs text-slate-400">{timeAgo(job.created_at)}</p>
                      </div>
                      <Badge tone={STATUS_TONE[job.status] ?? 'neutral'}>{job.status}</Badge>
                    </Card>
                  </Link>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 sm:mt-10">
        <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">Jump back in</h2>
        <p className="mt-1 text-sm text-slate-500">Shortcuts to the work surfaces you use most.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { to: '/review-queue', label: 'Review queue', icon: Search },
            { to: '/jobs', label: 'Jobs monitor', icon: Settings2 },
            { to: '/groups', label: 'Groups', icon: Package },
            { to: '/listings', label: 'Listings', icon: Tag },
          ].map((link, i) => (
            <motion.div key={link.to} custom={i} initial="hidden" animate="show" variants={fadeUp}>
              <Link to={link.to}>
                <Card hover className="flex flex-col items-center gap-2.5 p-5 text-center sm:p-6">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sand text-brand-700">
                    <link.icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <span className="text-sm font-semibold text-ink">{link.label}</span>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
