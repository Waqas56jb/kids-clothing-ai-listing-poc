import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listJobs } from '../../api'
import { Table, Thead, Th, Tr, Td } from '../ui/Table'
import Badge from '../ui/Badge'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

const STATUS_TONE = { done: 'good', processing: 'info', queued: 'neutral', error: 'bad' }
const STAGE_LABEL = {
  detecting: 'Detecting garments',
  segmenting_extracting: 'Segmenting & extracting attributes',
}

export default function JobsMonitorPage() {
  const [jobs, setJobs] = useState(null)

  useEffect(() => {
    let cancelled = false
    function poll() {
      listJobs()
        .then((data) => {
          if (!cancelled) setJobs(data)
        })
        .catch(() => {
          if (!cancelled) setJobs([])
        })
        .finally(() => {
          if (!cancelled) setTimeout(poll, 4000)
        })
    }
    poll()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">Processing Jobs</h1>
      <p className="mt-1 text-sm text-slate-500">Live view of every job's stage, progress, and errors. Refreshes automatically.</p>

      <div className="mt-5">
        {jobs === null ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState icon="⚙️" title="No jobs yet" description="Jobs will appear here as sellers upload photos." />
        ) : (
          <Table>
            <Thead>
              <Th>Job</Th>
              <Th>Status</Th>
              <Th>Stage</Th>
              <Th>Progress</Th>
              <Th>Error</Th>
            </Thead>
            <tbody>
              {jobs.map((job) => (
                <Tr key={job.job_id}>
                  <Td>
                    <Link to={`/admin/projects/${job.job_id}`} className="font-semibold text-brand-700 hover:underline">
                      {job.job_id}
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[job.status] ?? 'neutral'}>{job.status}</Badge>
                  </Td>
                  <Td className="text-slate-500">{STAGE_LABEL[job.stage] ?? job.stage ?? '—'}</Td>
                  <Td className="w-40">
                    {job.total > 0 ? (
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${Math.round((job.current / job.total) * 100)}%` }}
                        />
                      </div>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td className="max-w-xs truncate text-rose-600">{job.error ?? '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  )
}
