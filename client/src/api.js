export async function createJob(files) {
  const formData = new FormData()
  for (const file of files) formData.append('images', file)

  const res = await fetch('/api/jobs', { method: 'POST', body: formData })
  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}

export async function getJob(jobId) {
  const res = await fetch(`/api/jobs/${jobId}`)
  if (!res.ok) throw new Error('Failed to fetch job status')
  return res.json()
}

export function fileUrl(jobId, relativePath) {
  return `/files/${jobId}/${relativePath}`
}
