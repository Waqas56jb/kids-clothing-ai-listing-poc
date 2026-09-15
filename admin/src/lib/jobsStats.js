export function timeAgo(unixSeconds) {
  const seconds = Math.max(0, Date.now() / 1000 - unixSeconds)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
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

export function statusSeries(jobs = []) {
  const counts = { Completed: 0, Processing: 0, Queued: 0, Failed: 0 }
  for (const job of jobs) {
    if (job.status === 'done') counts.Completed += 1
    else if (job.status === 'processing') counts.Processing += 1
    else if (job.status === 'queued') counts.Queued += 1
    else if (job.status === 'error') counts.Failed += 1
  }
  const colors = {
    Completed: '#059669',
    Processing: '#1d4fc7',
    Queued: '#94a3b8',
    Failed: '#e11d48',
  }
  return Object.entries(counts)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name, value, fill: colors[name] }))
}
