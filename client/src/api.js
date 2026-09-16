import { getAccessToken as readToken } from './lib/session'

// Empty = same-origin /api (works on sslip, nip, and Cloudflare tunnel).
export const API_BASE = (import.meta.env.VITE_API_URL || '').trim()

const SIGN_IN_AGAIN = 'Logga in igen för att fortsätta'

async function getAccessToken() {
  const token = readToken()
  if (!token) throw new Error(SIGN_IN_AGAIN)
  return token
}

async function authHeaders(extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${await getAccessToken()}`,
  }
}

function optionalAuthHeaders(extra = {}) {
  const token = readToken()
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra }
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
  if (res.status === 401) throw new Error(SIGN_IN_AGAIN)
  throw new Error(detail)
}

async function jsonRequest(path, { method = 'GET', body, auth = true } = {}, fallback = 'Något gick fel') {
  const headers = auth ? await authHeaders() : optionalAuthHeaders()
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return parse(res, fallback)
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
  return parse(res, 'Kunde inte hämta omgången')
}

export async function listJobs() {
  const res = await fetch(`${API_BASE}/api/jobs`, { headers: await authHeaders() })
  return parse(res, 'Kunde inte hämta dina omgångar')
}

export function fileUrl(jobId, relativePath) {
  const token = readToken()
  const url = `${API_BASE}/files/${jobId}/${relativePath}`
  if (!token) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}token=${encodeURIComponent(token)}`
}

/** URL for a storage path like `jobId/crops/x.jpg` (marketplace images). */
export function storageUrl(path) {
  if (!path) return ''
  const [jobId, ...rest] = String(path).split('/')
  return fileUrl(jobId, rest.join('/'))
}

export async function patchWorkspace(jobId, patch) {
  return jsonRequest(`/api/jobs/${jobId}/workspace`, { method: 'PATCH', body: patch }, 'Kunde inte spara')
}

export async function publishJob(jobId, { garmentIds, prices } = {}) {
  return jsonRequest(
    `/api/jobs/${jobId}/publish`,
    { method: 'POST', body: { garment_ids: garmentIds ?? null, prices: prices ?? {} } },
    'Kunde inte publicera',
  )
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
  return `/api/pricing/${encodeURIComponent(pricingId)}${suffix}`
}

export async function approvePricingApi(pricingId, body = {}) {
  return jsonRequest(pricingPath(pricingId, '/approve'), { method: 'POST', body }, 'Kunde inte godkänna priset')
}

export async function rejectPricingApi(pricingId, body = {}) {
  return jsonRequest(pricingPath(pricingId, '/reject'), { method: 'POST', body }, 'Kunde inte avvisa priset')
}

export async function updatePricingApi(pricingId, body = {}) {
  return jsonRequest(pricingPath(pricingId), { method: 'PATCH', body }, 'Kunde inte uppdatera priset')
}

export async function getPricingHistoryApi(pricingId) {
  return jsonRequest(pricingPath(pricingId, '/history'), {}, 'Kunde inte hämta prishistorik')
}

// ---- Marketplace (public browse; account only for buy/offer/favorite) ----

export async function listMarketplace(params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, value)
  }
  const suffix = query.toString() ? `?${query}` : ''
  return jsonRequest(`/api/marketplace/listings${suffix}`, { auth: false }, 'Kunde inte hämta annonser')
}

export async function getListing(listingId) {
  return jsonRequest(`/api/marketplace/listings/${listingId}`, { auth: false }, 'Annonsen hittades inte')
}

export async function updateListing(listingId, patch) {
  return jsonRequest(`/api/marketplace/listings/${listingId}`, { method: 'PATCH', body: patch }, 'Kunde inte uppdatera annonsen')
}

export async function favoriteListing(listingId) {
  return jsonRequest(`/api/marketplace/listings/${listingId}/favorite`, { method: 'POST' }, 'Kunde inte spara favoriten')
}

export async function unfavoriteListing(listingId) {
  return jsonRequest(`/api/marketplace/listings/${listingId}/favorite`, { method: 'DELETE' }, 'Kunde inte ta bort favoriten')
}

export async function createOffer(listingId, { kind = 'offer', amount, message } = {}) {
  return jsonRequest(
    `/api/marketplace/listings/${listingId}/offers`,
    { method: 'POST', body: { kind, amount, message } },
    'Kunde inte skicka budet',
  )
}

export async function myOffers() {
  return jsonRequest('/api/me/offers', {}, 'Kunde inte hämta bud')
}

export async function respondOffer(offerId, action) {
  return jsonRequest(`/api/offers/${offerId}/${action}`, { method: 'POST' }, 'Kunde inte uppdatera budet')
}

export async function myFavorites() {
  return jsonRequest('/api/me/favorites', {}, 'Kunde inte hämta favoriter')
}

export async function myListings() {
  return jsonRequest('/api/me/listings', {}, 'Kunde inte hämta dina annonser')
}
