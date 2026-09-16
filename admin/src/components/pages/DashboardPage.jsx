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
import { jobStatusLabel, plural } from '../../lib/sv'
import StatCard from '../ui/StatCard'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Skeleton from '../ui/Skeleton'
import Loader from '../ui/Loader'

const STATUS_TONE = { done: 'good', processing: 'info', queued: 'neutral', error: 'bad' }
const asset = (path) => `/${String(path).replace(/^\//, '')}`

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
        toast.error(err.message || 'Kunde inte hämta jobb från servern')
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
        <Loader label="Hämtar aktuell status…" />
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">Adminpanel</p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">
            {firstName ? `Hej ${firstName}, här är läget` : 'Systemöversikt'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65 sm:text-base">
            Aktuell bild av alla säljares omgångar – bilder in, plagg ut och det som fortfarande bearbetas.
          </p>
        </div>
      </motion.section>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:mt-8 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Projekt" value={jobs.length} hint="Alla säljares omgångar" icon={FolderKanban} tone="brand" />
        <StatCard label="Bilder" value={totalPhotos} hint="Bilder som AI:n har bearbetat" icon={Camera} tone="brand" />
        <StatCard
          label="Plagg"
          value={totalGarments}
          hint={`I snitt ${avgGarments || 0} per klar omgång`}
          icon={Shirt}
          tone="emerald"
        />
        <StatCard
          label="Pågår"
          value={processing.length}
          hint={`${errored.length} misslyckade`}
          icon={Settings2}
          tone="amber"
        />
      </div>

      {errored.length > 0 && (
        <div className="mt-6 flex items-start gap-2.5 rounded-3xl border border-rose-100 bg-rose-50/80 p-4 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {errored.length} projekt misslyckades under bearbetningen.{' '}
            <Link to="/jobs" className="font-semibold underline underline-offset-2">
              Öppna bearbetningsjobb
            </Link>
          </span>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:mt-8 lg:gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard title="Genomflöde" subtitle="Bilder och plagg per omgång, från äldst till nyast.">
            <div className="h-64 sm:h-72">
              {trend.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-2xl bg-sand/40 text-sm text-slate-400">
                  Inga omgångar än – diagrammen fylls på när jobb blir klara.
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
                    <Area type="monotone" dataKey="photos" name="Bilder" stroke="#1d4fc7" fill="url(#gPhotos)" strokeWidth={2.5} />
                    <Area type="monotone" dataKey="garments" name="Plagg" stroke="#3d5c4a" fill="url(#gGarments)" strokeWidth={2.5} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </ChartCard>
        </div>

        <ChartCard title="Statusfördelning" subtitle="Andel omgångar per aktuell status.">
          <div className="h-64 sm:h-72">
            {mix.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl bg-sand/40 text-sm text-slate-400">
                Väntar på det första jobbet.
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
        <ChartCard title="Jämförelse per omgång" subtitle="Uppladdade bilder jämfört med hittade plagg i de senaste jobben.">
          <div className="h-60">
            {trend.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl bg-sand/40 text-sm text-slate-400">
                Ingen jämförelsedata än.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#e8eef8" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="photos" name="Bilder" fill="#86b0ff" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="garments" name="Plagg" fill="#1d4fc7" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        <div>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink">Senaste projekten</h2>
              <p className="mt-1 text-sm text-slate-500">Nyaste omgångarna först.</p>
            </div>
            <Link to="/projects" className="text-sm font-semibold text-brand-700 hover:underline">
              Visa alla
            </Link>
          </div>
          <div className="space-y-2">
            {jobs.length === 0 ? (
              <Card className="p-6 text-center text-sm text-slate-400">Inga projekt än.</Card>
            ) : (
              jobs.slice(0, 5).map((job, i) => (
                <motion.div key={job.job_id} custom={i} initial="hidden" animate="show" variants={fadeUp}>
                  <Link to={`/projects/${job.job_id}`}>
                    <Card hover className="flex items-center justify-between gap-3 p-3.5 sm:p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {job.job_id.slice(0, 10)} · {job.image_count} {plural(job.image_count, 'bild', 'bilder')}
                        </p>
                        <p className="text-xs text-slate-400">{timeAgo(job.created_at)}</p>
                      </div>
                      <Badge tone={STATUS_TONE[job.status] ?? 'neutral'}>{jobStatusLabel(job.status)}</Badge>
                    </Card>
                  </Link>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 sm:mt-10">
        <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">Fortsätt där du var</h2>
        <p className="mt-1 text-sm text-slate-500">Genvägar till de vyer du använder mest.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { to: '/review-queue', label: 'Granskningskö', icon: Search },
            { to: '/jobs', label: 'Bearbetningsjobb', icon: Settings2 },
            { to: '/groups', label: 'Grupper & paket', icon: Package },
            { to: '/listings', label: 'Annonser', icon: Tag },
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
