import { getAccessToken as readToken } from './lib/session'

// Empty = same-origin /api (works on sslip, nip, and Cloudflare tunnel).
export const API_BASE = (import.meta.env.VITE_API_URL || '').trim()

async function getAccessToken() {
  const token = readToken()
  if (!token) throw new Error('Please sign in again')
  return token
}

async function authHeaders(extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${await getAccessToken()}`,
  }
}

async function parse(res, fallback) {
  if (res.ok) return res.json()
  let detail = fallback
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') detail = body.detail
  } catch {
    /* keep fallback */
  }
  if (res.status === 401) throw new Error('Please sign in again')
  throw new Error(detail)
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
  const token = readToken()
  const url = `${API_BASE}/files/${jobId}/${relativePath}`
  if (!token) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}token=${encodeURIComponent(token)}`
}

export async function patchWorkspace(jobId, patch) {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/workspace`, {
    method: 'PATCH',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return parse(res, 'Failed to save')
}

export async function getJobPricing(jobId) {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/pricing`, { headers: await authHeaders() })
  return parse(res, 'Failed to fetch pricing')
}

export async function listPricing() {
  const res = await fetch(`${API_BASE}/api/pricing`, { headers: await authHeaders() })
  return parse(res, 'Failed to fetch pricing')
}

function pricingPath(pricingId, suffix = '') {
  return `${API_BASE}/api/pricing/${encodeURIComponent(pricingId)}${suffix}`
}

export async function approvePricingApi(pricingId, body = {}) {
  const res = await fetch(pricingPath(pricingId, '/approve'), {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parse(res, 'Failed to approve price')
}

export async function rejectPricingApi(pricingId, body = {}) {
  const res = await fetch(pricingPath(pricingId, '/reject'), {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parse(res, 'Failed to reject price')
}

export async function updatePricingApi(pricingId, body = {}) {
  const res = await fetch(pricingPath(pricingId), {
    method: 'PATCH',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parse(res, 'Failed to update price')
}

export async function getPricingHistoryApi(pricingId) {
  const res = await fetch(pricingPath(pricingId, '/history'), { headers: await authHeaders() })
  return parse(res, 'Failed to fetch pricing history')
}
