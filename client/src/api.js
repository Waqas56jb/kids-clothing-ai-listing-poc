import { supabase } from './lib/supabase'

// In local dev, relative paths go through the Vite proxy (see
// vite.config.js) straight to the local backend. In a production build,
// there's no such proxy -- the deployed client and backend are two
// separate Railway services on two separate domains -- so we need the
// backend's actual URL. `VITE_API_URL` (a Railway service variable, baked
// in at build time) is the proper way to configure it; the literal
// Railway URL here is just a safety-net default so the deployed app
// still works correctly even if that variable is never set.
const API_BASE =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.PROD ? 'https://kids-clothing-ai-listing-poc-production.up.railway.app' : '')

async function authHeaders(extra = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function parse(res, fallback) {
  if (res.status === 401) throw new Error('Please sign in again')
  if (!res.ok) throw new Error(fallback)
  return res.json()
}

export async function createJob(files) {
  const formData = new FormData()
  for (const file of files) formData.append('images', file)

  const res = await fetch(`${API_BASE}/api/jobs`, {
    method: 'POST',
    headers: await authHeaders(),
    body: formData,
  })
  return parse(res, 'Upload failed')
}

export async function getJob(jobId) {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}`, { headers: await authHeaders() })
  return parse(res, 'Failed to fetch job status')
}

export async function listJobs() {
  const res = await fetch(`${API_BASE}/api/jobs`, { headers: await authHeaders() })
  return parse(res, 'Failed to fetch jobs')
}

export function fileUrl(jobId, relativePath) {
  return `${API_BASE}/files/${jobId}/${relativePath}`
}
