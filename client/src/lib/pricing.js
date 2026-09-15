// Pricing data model + service layer.
//
// IMPORTANT: there is no pricing engine or pricing endpoint on the backend
// yet (that's real business logic -- market data, historical sales, brand
// value, condition weighting -- deferred to Milestone 4, same as grouping
// and listing-copy generation elsewhere in this codebase). Everything in
// this file is a clearly-scoped MOCK standing in for that future FastAPI
// service, so the UI, state shape, and workflow can be built and reviewed
// now. The mock intentionally keeps confidence in the "needs a human
// look" range rather than pretending to be a finished, trustworthy model
// -- pricing is ALWAYS an AI suggestion here, never an auto-final price.
//
// Swapping this out in Milestone 4 means replacing the function bodies
// below with real `fetch` calls to FastAPI -- every call site already
// treats these as async, and the shape they return
// (`PricingRecommendation`) is the contract the backend should match.

/**
 * @typedef {'not_calculated'|'ai_calculated'|'needs_review'|'approved'|'manually_adjusted'|'rejected'} PricingStatus
 */

/** @type {Record<string, PricingStatus>} */
export const PRICING_STATUS = {
  NOT_CALCULATED: 'not_calculated',
  AI_CALCULATED: 'ai_calculated',
  NEEDS_REVIEW: 'needs_review',
  APPROVED: 'approved',
  MANUALLY_ADJUSTED: 'manually_adjusted',
  REJECTED: 'rejected',
}

export const PRICING_STATUS_LABEL = {
  [PRICING_STATUS.NOT_CALCULATED]: 'Not Calculated',
  [PRICING_STATUS.AI_CALCULATED]: 'AI Calculated',
  [PRICING_STATUS.NEEDS_REVIEW]: 'Needs Review',
  [PRICING_STATUS.APPROVED]: 'Approved',
  [PRICING_STATUS.MANUALLY_ADJUSTED]: 'Manually Adjusted',
  [PRICING_STATUS.REJECTED]: 'Rejected',
}

/**
 * @typedef {Object} PricingRecommendation
 * @property {string} id                     -- `garment:<id>` or `group:<id>`
 * @property {string|null} garmentId
 * @property {string|null} groupId
 * @property {string|null} jobId
 * @property {string} currency
 * @property {number} minPrice
 * @property {number} maxPrice
 * @property {number} recommendedPrice
 * @property {number} confidence            -- 0..1
 * @property {string} reason                -- placeholder until Milestone 4; see note below
 * @property {PricingStatus} status
 * @property {number|null} finalPrice
 * @property {string|null} adjustedBy
 * @property {string|null} adjustedAt       -- ISO date string
 * @property {string|null} note
 * @property {Object} [meta]                -- denormalized display fields (category, brand, ...)
 */

/**
 * @typedef {Object} PricingHistoryEntry
 * @property {string} id
 * @property {string} pricingId
 * @property {string} changedBy
 * @property {string} date                  -- ISO date string
 * @property {number|null} previousPrice
 * @property {number} newPrice
 * @property {string} [reason]
 */

// Illustrative-only category base ranges (SEK). This is exactly the kind
// of "Pricing Rules" the admin Pricing Engine page previews as a *future*
// config surface (Section 11) -- reused here as the mock's input so the
// same numbers show up consistently, not because this is the real engine.
export const MOCK_CATEGORY_BASE_RANGES = {
  bodysuit: [30, 50],
  onesie: [30, 50],
  romper: [35, 60],
  sleeper: [35, 60],
  dress: [50, 90],
  jacket: [80, 150],
  coat: [90, 160],
  sweater: [50, 90],
  cardigan: [45, 80],
  shirt: [30, 60],
  blouse: [30, 60],
  't-shirt': [25, 45],
  top: [25, 45],
  trousers: [30, 55],
  pants: [30, 55],
  shorts: [25, 45],
  skirt: [30, 55],
  hat: [15, 30],
  beanie: [15, 30],
  vest: [40, 70],
  default: [30, 60],
}

const STORE_KEY = 'kids_ai_pricing_store_v1'
const HISTORY_KEY = 'kids_ai_pricing_history_v1'

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) ?? {}
  } catch {
    return {}
  }
}
function writeStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    // best-effort only -- a full/blocked localStorage shouldn't crash the UI
  }
}
function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) ?? {}
  } catch {
    return {}
  }
}
function writeHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  } catch {
    // best-effort
  }
}

function hashString(value) {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

/** Deterministic per-id pseudo-random in [0, 1), stable across renders/reloads. */
function seededRandom(id) {
  return (hashString(id) % 10000) / 10000
}

function round5(value) {
  return Math.round(value / 5) * 5
}

/**
 * Produces a plausible-looking, but explicitly mock, price range from
 * whatever real attributes are available. Confidence is deliberately
 * pulled down when key attributes (brand/size/condition) are missing --
 * this is meant to *feel* like "the AI is being honest about how little
 * it has to go on", the same principle already applied to condition/
 * defect detection elsewhere in this project, not a scoring model.
 */
function computeMockPricing(attrs) {
  const category = (attrs.category || 'default').toLowerCase()
  const [baseMin, baseMax] = MOCK_CATEGORY_BASE_RANGES[category] ?? MOCK_CATEGORY_BASE_RANGES.default
  const seed = seededRandom(`${attrs.category}|${attrs.brand}|${attrs.size}|${attrs.id ?? ''}`)

  const brandBoost = attrs.brand ? 1.15 : 1
  const conditionFactor = { good: 1, 'like new': 1.2, new: 1.35, fair: 0.8, damaged: 0.55, worn: 0.7 }[
    (attrs.condition || '').toLowerCase()
  ] ?? 0.9

  const spread = 1 + (seed - 0.5) * 0.3 // +/-15% deterministic jitter
  const minPrice = Math.max(10, round5(baseMin * brandBoost * conditionFactor * spread))
  const maxPrice = Math.max(minPrice + 10, round5(baseMax * brandBoost * conditionFactor * spread))
  const recommendedPrice = round5((minPrice + maxPrice) / 2)

  const known = ['brand', 'size', 'condition'].filter((k) => attrs[k]).length
  const confidence = Math.min(0.92, 0.4 + known * 0.15 + seed * 0.1)

  return { minPrice, maxPrice, recommendedPrice, confidence }
}

function newRecommendation(id, attrs, jobId) {
  const { minPrice, maxPrice, recommendedPrice, confidence } = computeMockPricing(attrs)
  return {
    id,
    garmentId: attrs.kind === 'garment' ? attrs.id : null,
    groupId: attrs.kind === 'group' ? attrs.id : null,
    jobId: jobId ?? null,
    currency: 'SEK',
    minPrice,
    maxPrice,
    recommendedPrice,
    confidence,
    // Placeholder only -- real reasoning must come from the backend/AI in
    // Milestone 4. Deliberately generic so it never reads as a genuine
    // model explanation.
    reason: 'Estimated from category, brand presence, and condition. Full AI reasoning arrives with the backend pricing engine.',
    status: confidence < 0.65 ? PRICING_STATUS.NEEDS_REVIEW : PRICING_STATUS.AI_CALCULATED,
    finalPrice: null,
    adjustedBy: null,
    adjustedAt: null,
    note: null,
    meta: {
      category: attrs.category ?? null,
      brand: attrs.brand ?? null,
      size: attrs.size ?? null,
      condition: attrs.condition ?? null,
      color: attrs.color ?? null,
      gender: attrs.gender ?? null,
      itemCount: attrs.itemCount ?? 1,
    },
  }
}

function appendHistory(pricingId, entry) {
  const history = readHistory()
  const list = history[pricingId] ?? []
  list.push({ id: `${pricingId}:${list.length}`, pricingId, ...entry })
  history[pricingId] = list
  writeHistory(history)
}

// ---- Public service API (async to mirror the real future backend calls) ----

export async function getGarmentPricing(jobId, garment) {
  const id = `garment:${jobId}:${garment.id}`
  const store = readStore()
  if (!store[id]) {
    store[id] = newRecommendation(
      id,
      {
        kind: 'garment',
        id: garment.id,
        category: garment.category,
        brand: garment.brand,
        size: garment.size,
        condition: garment.defects ? 'damaged' : garment.condition,
        color: garment.color,
        gender: garment.gender,
      },
      jobId,
    )
    writeStore(store)
  }
  return store[id]
}

export async function getGroupPricing(jobId, group) {
  const id = `group:${jobId}:${group.id}`
  const store = readStore()
  if (!store[id]) {
    const base = newRecommendation(
      id,
      { kind: 'group', id: group.id, category: group.category, size: group.size, itemCount: group.garmentIds.length },
      jobId,
    )
    // A package isn't just one item's range -- scale by item count with a
    // modest multi-item discount, same spirit as the brief's own "5
    // bodysuits -> 200-250 SEK, not 5x a single price" example.
    const discount = 0.85
    base.minPrice = round5(base.minPrice * group.garmentIds.length * discount)
    base.maxPrice = round5(base.maxPrice * group.garmentIds.length * discount)
    base.recommendedPrice = round5((base.minPrice + base.maxPrice) / 2)
    base.meta.itemCount = group.garmentIds.length
    store[id] = base
    writeStore(store)
  }
  return store[id]
}

export async function getProjectPricing(jobId, garments) {
  return Promise.all(garments.map((g) => getGarmentPricing(jobId, g)))
}

export async function listAllPricing() {
  return Object.values(readStore())
}

export async function approvePricing(pricingId, { actor = 'Seller', note } = {}) {
  const store = readStore()
  const record = store[pricingId]
  if (!record) throw new Error('Pricing record not found')
  const previousPrice = record.finalPrice
  record.status = PRICING_STATUS.APPROVED
  record.finalPrice = record.recommendedPrice
  record.adjustedBy = actor
  record.adjustedAt = new Date().toISOString()
  if (note) record.note = note
  writeStore(store)
  appendHistory(pricingId, {
    changedBy: actor,
    date: record.adjustedAt,
    previousPrice,
    newPrice: record.finalPrice,
    reason: 'Approved AI recommendation',
  })
  return record
}

export async function updatePricing(pricingId, { minPrice, maxPrice, finalPrice, note, actor = 'Seller' } = {}) {
  const store = readStore()
  const record = store[pricingId]
  if (!record) throw new Error('Pricing record not found')
  const previousPrice = record.finalPrice
  if (minPrice != null) record.minPrice = minPrice
  if (maxPrice != null) record.maxPrice = maxPrice
  record.finalPrice = finalPrice != null ? finalPrice : record.finalPrice
  record.status = PRICING_STATUS.MANUALLY_ADJUSTED
  record.adjustedBy = actor
  record.adjustedAt = new Date().toISOString()
  record.note = note ?? record.note
  writeStore(store)
  appendHistory(pricingId, {
    changedBy: actor,
    date: record.adjustedAt,
    previousPrice,
    newPrice: record.finalPrice,
    reason: note || 'Manual price adjustment',
  })
  return record
}

export async function rejectPricing(pricingId, { note, actor = 'Admin' } = {}) {
  const store = readStore()
  const record = store[pricingId]
  if (!record) throw new Error('Pricing record not found')
  const previousPrice = record.finalPrice
  record.status = PRICING_STATUS.REJECTED
  record.finalPrice = null
  record.adjustedBy = actor
  record.adjustedAt = new Date().toISOString()
  record.note = note ?? record.note
  writeStore(store)
  appendHistory(pricingId, {
    changedBy: actor,
    date: record.adjustedAt,
    previousPrice,
    newPrice: null,
    reason: note || 'Rejected AI recommendation',
  })
  return record
}

export async function getPricingHistory(pricingId) {
  const history = readHistory()
  return history[pricingId] ?? []
}
