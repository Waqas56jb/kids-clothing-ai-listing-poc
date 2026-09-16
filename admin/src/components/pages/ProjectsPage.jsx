import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import { listJobs } from '../../api'
import { jobStatusLabel, timeAgoSv } from '../../lib/sv'
import { Table, Thead, Th, Tr, Td } from '../ui/Table'
import Badge from '../ui/Badge'
import Tabs from '../ui/Tabs'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

const STATUS_TONE = { done: 'good', processing: 'info', queued: 'neutral', error: 'bad' }

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
      <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Projekt</h1>
      <p className="mt-1 text-sm text-slate-500">Alla säljares uppladdade omgångar med aktuell bearbetningsstatus.</p>

      <div className="mt-5 overflow-x-auto">
        <Tabs
          tabs={[
            { value: 'all', label: 'Alla' },
            { value: 'processing', label: 'Bearbetas' },
            { value: 'done', label: 'Klara' },
            { value: 'error', label: 'Misslyckade' },
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
          <EmptyState icon={FolderKanban} title="Inga projekt hittades" description="Inget matchar det här filtret än." />
        ) : (
          <Table>
            <Thead>
              <Th>Projekt</Th>
              <Th>Bilder</Th>
              <Th>Plagg</Th>
              <Th>Status</Th>
              <Th>Skapad</Th>
            </Thead>
            <tbody>
              {filtered.map((job) => (
                <Tr key={job.job_id} className="cursor-pointer">
                  <Td>
                    <Link to={`/projects/${job.job_id}`} className="font-semibold text-brand-700 hover:underline">
                      {job.job_id}
                    </Link>
                  </Td>
                  <Td>{job.image_count}</Td>
                  <Td>{job.garment_count ?? '—'}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[job.status] ?? 'neutral'}>{jobStatusLabel(job.status)}</Badge>
                  </Td>
                  <Td className="text-slate-400">{timeAgoSv(job.created_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  )
}
