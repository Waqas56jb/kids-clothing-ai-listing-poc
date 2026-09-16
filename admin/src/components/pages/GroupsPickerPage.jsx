import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package } from 'lucide-react'
import { listJobs } from '../../api'
import { plural } from '../../lib/sv'
import Card from '../ui/Card'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

export default function GroupsPickerPage() {
  const [jobs, setJobs] = useState(null)

  useEffect(() => {
    listJobs()
      .then((data) => setJobs(data.filter((j) => j.status === 'done')))
      .catch(() => setJobs([]))
  }, [])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">Grupper &amp; paket</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Välj ett färdigt projekt för att granska AI:ns paketförslag (grupperade efter storlek och kategori).
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {jobs === null ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : jobs.length === 0 ? (
          <div className="col-span-full">
            <EmptyState icon={Package} title="Inga färdiga projekt än" />
          </div>
        ) : (
          jobs.map((job) => (
            <Link key={job.job_id} to={`/groups/${job.job_id}`}>
              <Card hover className="p-4">
                <p className="truncate font-semibold text-slate-700">{job.job_id}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {job.image_count} {plural(job.image_count, 'bild', 'bilder')} · {job.garment_count ?? 0} plagg
                </p>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
