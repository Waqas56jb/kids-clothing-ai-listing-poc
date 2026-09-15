import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Camera, FolderKanban, Package, Search, Settings2, Shirt, Tag } from 'lucide-react'
import { listJobs } from '../../api'
import StatCard from '../ui/StatCard'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Skeleton from '../ui/Skeleton'

const STATUS_TONE = { done: 'good', processing: 'info', queued: 'neutral', error: 'bad' }

export default function DashboardPage() {
  const [jobs, setJobs] = useState(null)

  useEffect(() => {
    listJobs()
      .then(setJobs)
      .catch(() => setJobs([]))
  }, [])

  const done = jobs?.filter((j) => j.status === 'done') ?? []
  const errored = jobs?.filter((j) => j.status === 'error') ?? []
  const processing = jobs?.filter((j) => j.status === 'processing' || j.status === 'queued') ?? []
  const totalGarments = done.reduce((sum, j) => sum + (j.garment_count ?? 0), 0)
  const totalPhotos = jobs?.reduce((sum, j) => sum + (j.image_count ?? 0), 0) ?? 0

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">System Overview</h1>
      <p className="mt-1 text-sm text-slate-500">Live snapshot of processing across all seller projects.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total projects" value={jobs?.length ?? '—'} icon={FolderKanban} tone="brand" />
        <StatCard label="Photos processed" value={totalPhotos} icon={Camera} tone="brand" />
        <StatCard label="Garments detected" value={totalGarments} icon={Shirt} tone="emerald" />
        <StatCard label="Currently processing" value={processing.length} icon={Settings2} tone="amber" />
      </div>

      {errored.length > 0 && (
        <div className="mt-6 flex items-start gap-2.5 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {errored.length} project{errored.length > 1 ? 's' : ''} failed processing.{' '}
            <Link to="/jobs" className="font-semibold underline">
              View jobs monitor →
            </Link>
          </span>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-800">Recent projects</h2>
            <Link to="/projects" className="text-sm font-semibold text-brand-600 hover:underline">
              View all →
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {jobs === null ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : jobs.length === 0 ? (
              <Card className="p-6 text-center text-sm text-slate-400">No projects yet.</Card>
            ) : (
              jobs.slice(0, 6).map((job) => (
                <Link key={job.job_id} to={`/projects/${job.job_id}`}>
                  <Card hover className="flex items-center justify-between gap-3 p-3.5">
                    <span className="truncate text-sm font-semibold text-slate-700">
                      {job.job_id.slice(0, 10)} · {job.image_count} photos
                    </span>
                    <Badge tone={STATUS_TONE[job.status] ?? 'neutral'}>{job.status}</Badge>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </div>

        <div>
          <h2 className="font-display text-lg font-bold text-slate-800">Quick links</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {[
              { to: '/review-queue', label: 'Review Queue', icon: Search },
              { to: '/jobs', label: 'Jobs Monitor', icon: Settings2 },
              { to: '/groups', label: 'Groups', icon: Package },
              { to: '/listings', label: 'Listings', icon: Tag },
            ].map((link) => (
              <Link key={link.to} to={link.to}>
                <Card hover className="flex flex-col items-center gap-2 p-5 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <link.icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <span className="text-sm font-semibold text-slate-700">{link.label}</span>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
