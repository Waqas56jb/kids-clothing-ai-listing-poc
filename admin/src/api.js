import { getAccessToken as readToken } from './lib/session'

// Empty = same-origin /api (works on sslip, nip, and Cloudflare tunnel).
export const API_BASE = (import.meta.env.VITE_API_URL || '').trim()

async function getAccessToken() {
  const token = readToken()
  if (!token) throw new Error('Logga in igen för att fortsätta')
  return token
}

async function authHeaders() {
  return { Authorization: `Bearer ${await getAccessToken()}` }
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
  if (res.status === 401) throw new Error('Logga in igen för att fortsätta')
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
  return parse(res, 'Uppladdningen misslyckades')
}

export async function getJob(jobId) {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}`, { headers: await authHeaders() })
  return parse(res, 'Kunde inte hämta jobbstatus')
}

export async function listJobs() {
  const res = await fetch(`${API_BASE}/api/jobs`, { headers: await authHeaders() })
  return parse(res, 'Kunde inte hämta jobb')
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
  return parse(res, 'Kunde inte spara')
}

export async function getJobPricing(jobId) {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/pricing`, { headers: await authHeaders() })
  return parse(res, 'Kunde inte hämta prisförslag')
}

export async function listPricing() {
  const res = await fetch(`${API_BASE}/api/pricing`, { headers: await authHeaders() })
  return parse(res, 'Kunde inte hämta prisförslag')
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
  return parse(res, 'Kunde inte godkänna priset')
}

export async function rejectPricingApi(pricingId, body = {}) {
  const res = await fetch(pricingPath(pricingId, '/reject'), {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parse(res, 'Kunde inte avvisa priset')
}

export async function updatePricingApi(pricingId, body = {}) {
  const res = await fetch(pricingPath(pricingId), {
    method: 'PATCH',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parse(res, 'Kunde inte uppdatera priset')
}

export async function getPricingHistoryApi(pricingId) {
  const res = await fetch(pricingPath(pricingId, '/history'), { headers: await authHeaders() })
  return parse(res, 'Kunde inte hämta prishistorik')
}
