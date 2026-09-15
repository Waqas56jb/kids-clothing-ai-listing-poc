import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listJobs } from '../../api'
import { Table, Thead, Th, Tr, Td } from '../ui/Table'
import Badge from '../ui/Badge'
import Tabs from '../ui/Tabs'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

const STATUS_TONE = { done: 'good', processing: 'info', queued: 'neutral', error: 'bad' }

function timeAgo(unixSeconds) {
  const seconds = Math.max(0, Date.now() / 1000 - unixSeconds)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export default function ProjectsPage() {
  const [jobs, setJobs] = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    listJobs()
      .then(setJobs)
      .catch(() => setJobs([]))
  }, [])

  const filtered = useMemo(() => {
    if (!jobs) return []
    if (filter === 'all') return jobs
    return jobs.filter((j) => j.status === filter)
  }, [jobs, filter])

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">Projects</h1>
      <p className="mt-1 text-sm text-slate-500">Every seller upload batch, with live processing status.</p>

      <div className="mt-5 overflow-x-auto">
        <Tabs
          tabs={[
            { value: 'all', label: 'All' },
            { value: 'processing', label: 'Processing' },
            { value: 'done', label: 'Done' },
            { value: 'error', label: 'Failed' },
          ]}
          active={filter}
          onChange={setFilter}
        />
      </div>

      <div className="mt-5">
        {jobs === null ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="🗂️" title="No projects found" description="Nothing matches this filter yet." />
        ) : (
          <Table>
            <Thead>
              <Th>Project</Th>
              <Th>Photos</Th>
              <Th>Garments</Th>
              <Th>Status</Th>
              <Th>Created</Th>
            </Thead>
            <tbody>
              {filtered.map((job) => (
                <Tr key={job.job_id} className="cursor-pointer">
                  <Td>
                    <Link to={`/admin/projects/${job.job_id}`} className="font-semibold text-brand-700 hover:underline">
                      {job.job_id}
                    </Link>
                  </Td>
                  <Td>{job.image_count}</Td>
                  <Td>{job.garment_count ?? '—'}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[job.status] ?? 'neutral'}>{job.status}</Badge>
                  </Td>
                  <Td className="text-slate-400">{timeAgo(job.created_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  )
}
