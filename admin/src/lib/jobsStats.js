import { timeAgoSv } from './sv'

export function timeAgo(value) {
  return timeAgoSv(value)
}

export function summarizeJobs(jobs = []) {
  const done = jobs.filter((j) => j.status === 'done')
  const errored = jobs.filter((j) => j.status === 'error')
  const processing = jobs.filter((j) => j.status === 'processing' || j.status === 'queued')
  const totalGarments = done.reduce((sum, j) => sum + (j.garment_count ?? 0), 0)
  const totalPhotos = jobs.reduce((sum, j) => sum + (j.image_count ?? 0), 0)
  return { done, errored, processing, totalGarments, totalPhotos }
}

export function trendSeries(jobs = []) {
  return [...jobs]
    .slice()
    .sort((a, b) => a.created_at - b.created_at)
    .slice(-12)
    .map((job, index) => ({
      name: job.job_id.slice(0, 6),
      batch: index + 1,
      photos: job.image_count ?? 0,
      garments: job.garment_count ?? 0,
    }))
}

const STATUS_NAME = { done: 'Klara', processing: 'Bearbetas', queued: 'I kö', error: 'Misslyckade' }

export function statusSeries(jobs = []) {
  const counts = { done: 0, processing: 0, queued: 0, error: 0 }
  for (const job of jobs) {
    if (job.status in counts) counts[job.status] += 1
  }
  const colors = {
    done: '#059669',
    processing: '#1d4fc7',
    queued: '#94a3b8',
    error: '#e11d48',
  }
  return Object.entries(counts)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({ name: STATUS_NAME[key], value, fill: colors[key] }))
}
