import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fileUrl, getJob, listJobs } from '../../api'
import { needsAnyReview, toneForCondition, toneForMatch } from '../../lib/garment'
import Badge from '../ui/Badge'
import Card from '../ui/Card'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

export default function ReviewQueuePage() {
  const [items, setItems] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const jobs = await listJobs().catch(() => [])
      const done = jobs.filter((j) => j.status === 'done')
      const details = await Promise.all(done.map((j) => getJob(j.job_id)))
      if (cancelled) return
      const flagged = details.flatMap((job) =>
        (job.result?.garments ?? [])
          .filter(needsAnyReview)
          .map((garment) => ({ garment, jobId: job.job_id })),
      )
      setItems(flagged)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (items === null) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">Review Queue</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every garment across all projects with a flagged defect or an uncertain match — nothing here is auto-published.
      </p>

      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon="✅" title="Nothing needs review" description="All garments are high-confidence right now." />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ garment, jobId }) => (
            <Link key={`${jobId}-${garment.id}`} to={`/admin/garments/${jobId}/${garment.detection_ids[0]}`}>
              <Card hover className="overflow-hidden">
                <div className="aspect-square bg-surface">
                  <img
                    src={fileUrl(jobId, `debug/masks/${garment.detection_ids[0]}_masked.png`)}
                    alt=""
                    className="h-full w-full object-contain p-3"
                  />
                </div>
                <div className="space-y-2 p-4">
                  <p className="truncate text-sm font-semibold capitalize text-slate-700">
                    {garment.category.replace(/_/g, ' ')}
                  </p>
                  <p className="truncate text-xs text-slate-400">Project {jobId}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={toneForMatch(garment.match_status)}>{garment.match_status.replace(/_/g, ' ')}</Badge>
                    {garment.defects && <Badge tone={toneForCondition(garment.condition, true)}>Damage flagged</Badge>}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
