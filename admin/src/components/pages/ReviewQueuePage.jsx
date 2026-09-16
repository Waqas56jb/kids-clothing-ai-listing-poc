import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { fileUrl, getJob, listJobs } from '../../api'
import { garmentImagePath, needsAnyReview, toneForCondition, toneForMatch } from '../../lib/garment'
import { categoryLabel, matchStatusLabel } from '../../lib/sv'
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
      <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">Granskningskö</h1>
      <p className="mt-1 text-sm text-slate-500">
        Alla plagg i alla projekt med möjligt slitage eller en osäker matchning – inget här publiceras automatiskt.
      </p>

      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={CheckCircle2} title="Inget att granska" description="Alla plagg har hög säkerhet just nu." />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ garment, jobId }) => (
            <Link key={`${jobId}-${garment.id}`} to={`/garments/${jobId}/${garment.detection_ids[0]}`}>
              <Card hover className="overflow-hidden">
                <div className="aspect-square bg-surface">
                  <img
                    src={fileUrl(jobId, garmentImagePath(garment))}
                    alt=""
                    className="h-full w-full object-contain p-3"
                  />
                </div>
                <div className="space-y-2 p-4">
                  <p className="truncate text-sm font-semibold text-slate-700">{categoryLabel(garment.category)}</p>
                  <p className="truncate text-xs text-slate-400">Projekt {jobId}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={toneForMatch(garment.match_status)}>{matchStatusLabel(garment.match_status)}</Badge>
                    {garment.defects && <Badge tone={toneForCondition(garment.condition, true)}>Möjligt slitage</Badge>}
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
