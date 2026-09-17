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

export async function counterOffer(offerId, { amount, message } = {}) {
  return jsonRequest(`/api/offers/${offerId}/counter`, { method: 'POST', body: { amount, message } }, 'Kunde inte skicka motbudet')
}

export async function deleteGarmentImage(jobId, garmentId, detectionId) {
  return jsonRequest(`/api/jobs/${jobId}/garments/${garmentId}/images/${detectionId}`, { method: 'DELETE' }, 'Kunde inte ta bort bilden')
}

// ---- Notifications + push ----

export async function listNotifications() {
  return jsonRequest('/api/notifications', {}, 'Kunde inte hämta notiser')
}

export async function markNotificationsRead(ids) {
  return jsonRequest('/api/notifications/read', { method: 'POST', body: { ids } }, 'Kunde inte uppdatera notiser')
}

export async function getPushPublicKey() {
  return jsonRequest('/api/push/public-key', { auth: false }, 'Push är inte tillgängligt')
}

export async function savePushSubscription(subscription) {
  return jsonRequest('/api/push/subscribe', { method: 'POST', body: { subscription } }, 'Kunde inte aktivera push-notiser')
}

export async function removePushSubscription(endpoint) {
  return jsonRequest('/api/push/subscribe', { method: 'DELETE', body: { endpoint } }, 'Kunde inte stänga av push-notiser')
}

// ---- Messages ----

export async function sendListingMessage(listingId, { body, recipientId } = {}) {
  return jsonRequest(
    `/api/marketplace/listings/${listingId}/messages`,
    { method: 'POST', body: { body, recipient_id: recipientId } },
    'Kunde inte skicka meddelandet',
  )
}

export async function listThreads() {
  return jsonRequest('/api/messages', {}, 'Kunde inte hämta meddelanden')
}

export async function getConversation(listingId, otherId) {
  return jsonRequest(`/api/messages/${listingId}/${otherId}`, {}, 'Kunde inte hämta konversationen')
}

// ---- Cart, checkout, orders ----

export async function getCart() {
  return jsonRequest('/api/cart', {}, 'Kunde inte hämta varukorgen')
}

export async function addToCart(listingId) {
  return jsonRequest('/api/cart', { method: 'POST', body: { listing_id: listingId } }, 'Kunde inte lägga i varukorgen')
}

export async function removeFromCart(listingId) {
  return jsonRequest(`/api/cart/${listingId}`, { method: 'DELETE' }, 'Kunde inte ta bort från varukorgen')
}

export async function startCheckout({ shipping, paymentMethod }) {
  return jsonRequest('/api/checkout', { method: 'POST', body: { shipping, payment_method: paymentMethod } }, 'Kunde inte starta kassan')
}

export async function listOrders() {
  return jsonRequest('/api/orders', {}, 'Kunde inte hämta ordrar')
}

export async function getOrder(orderId) {
  return jsonRequest(`/api/orders/${orderId}`, {}, 'Ordern hittades inte')
}

export async function payOrderTest(orderId, card) {
  return jsonRequest(`/api/orders/${orderId}/pay`, { method: 'POST', body: card }, 'Betalningen misslyckades')
}

export async function confirmOrder(orderId, sessionId) {
  return jsonRequest(`/api/orders/${orderId}/confirm`, { method: 'POST', body: { session_id: sessionId } }, 'Kunde inte bekräfta betalningen')
}

export async function shipOrderItem(orderId, itemId) {
  return jsonRequest(`/api/orders/${orderId}/items/${itemId}/ship`, { method: 'POST' }, 'Kunde inte markera som skickad')
}
