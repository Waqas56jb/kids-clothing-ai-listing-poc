import { timeAgoSv } from './sv'

export function timeAgo(value) {
  return timeAgoSv(value)
}

export function summarizeJobs(jobs = []) {
  const done = jobs.filter((j) => j.status === 'done')
  const processing = jobs.filter((j) => j.status === 'processing' || j.status === 'queued')
  const totalGarments = done.reduce((sum, j) => sum + (j.garment_count ?? 0), 0)
  return { done, processing, totalGarments }
}

export function trendSeries(jobs = []) {
  return [...jobs]
    .slice()
    .sort((a, b) => a.created_at - b.created_at)
    .slice(-10)
    .map((job, index) => ({
      name: job.job_id.slice(0, 6),
      batch: index + 1,
      photos: job.image_count ?? 0,
      garments: job.garment_count ?? 0,
    }))
}
