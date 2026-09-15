import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Camera, Link2, Package, ScanSearch, Tag } from 'lucide-react'
import { fileUrl, getJob } from '../../api'
import { toneForCondition, toneForMatch } from '../../lib/garment'
import Badge from '../ui/Badge'
import Card from '../ui/Card'
import Skeleton from '../ui/Skeleton'
import StatCard from '../ui/StatCard'

const STATUS_TONE = { done: 'good', processing: 'info', queued: 'neutral', error: 'bad' }

export default function ProjectDetailPage() {
  const { jobId } = useParams()
  const [job, setJob] = useState(null)

  useEffect(() => {
    let cancelled = false
    function load() {
      getJob(jobId).then((data) => {
        if (cancelled) return
        setJob(data)
        if (data.status === 'processing' || data.status === 'queued') {
          setTimeout(load, 2000)
        }
      })
    }
    load()
    return () => {
      cancelled = true
    }
  }, [jobId])

  if (!job) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  const garments = job.result?.garments ?? []
  const needsReview = garments.filter((g) => g.match_status === 'needs_review' || g.defects).length

  return (
    <div>
      <Link to="/projects" className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> All projects
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">Project {job.job_id}</h1>
        <Badge tone={STATUS_TONE[job.status] ?? 'neutral'}>{job.status}</Badge>
      </div>

      {(job.status === 'processing' || job.status === 'queued') && (
        <Card className="mt-5 p-5">
          <p className="text-sm font-medium text-slate-700">Processing — {job.stage ?? 'starting up'}</p>
          {job.total > 0 && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${Math.round((job.current / job.total) * 100)}%` }}
              />
            </div>
          )}
        </Card>
      )}

      {job.status === 'error' && (
        <Card className="mt-5 flex items-start gap-2.5 border-rose-100 bg-rose-50 p-5 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Processing failed: {job.error}</span>
        </Card>
      )}

      {job.status === 'done' && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Photos" value={job.image_count} icon={Camera} tone="brand" />
            <StatCard label="Detections" value={job.result.total_detections} icon={ScanSearch} tone="brand" />
            <StatCard label="Garments" value={garments.length} icon={Package} tone="emerald" />
            <StatCard label="Needs review" value={needsReview} icon={AlertTriangle} tone="amber" />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link to={`/garments/${jobId}`} className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-soft hover:bg-brand-50">
              <ScanSearch className="h-4 w-4" /> Garment management
            </Link>
            <Link to={`/matching/${jobId}`} className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-soft hover:bg-brand-50">
              <Link2 className="h-4 w-4" /> Matching review
            </Link>
            <Link to={`/groups/${jobId}`} className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-soft hover:bg-brand-50">
              <Package className="h-4 w-4" /> Groups
            </Link>
            <Link to={`/listings/${jobId}`} className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-soft hover:bg-brand-50">
              <Tag className="h-4 w-4" /> Listings
            </Link>
          </div>

          <h2 className="mt-8 font-display text-lg font-bold text-slate-800">Detected garments</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {garments.map((garment) => (
              <Link key={garment.id} to={`/garments/${jobId}/${garment.detection_ids[0]}`}>
                <Card hover className="overflow-hidden">
                  <div className="aspect-square bg-surface">
                    <img
                      src={fileUrl(jobId, `debug/masks/${garment.detection_ids[0]}_masked.png`)}
                      alt={garment.category}
                      className="h-full w-full object-contain p-2"
                    />
                  </div>
                  <div className="space-y-1.5 p-3">
                    <p className="truncate text-sm font-semibold capitalize text-slate-700">
                      {garment.category.replace(/_/g, ' ')}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={toneForMatch(garment.match_status)} className="text-[10px]">
                        {garment.match_status.replace(/_/g, ' ')}
                      </Badge>
                      <Badge tone={toneForCondition(garment.condition, Boolean(garment.defects))} className="text-[10px]">
                        {garment.defects ? 'review' : (garment.condition ?? 'unknown')}
                      </Badge>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
