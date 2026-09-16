import {
  approvePricingApi,
  getJobPricing,
  getPricingHistoryApi,
  listPricing,
  rejectPricingApi,
  updatePricingApi,
} from '../api'

export const PRICING_STATUS = {
  NOT_CALCULATED: 'not_calculated',
  AI_CALCULATED: 'ai_calculated',
  NEEDS_REVIEW: 'needs_review',
  APPROVED: 'approved',
  MANUALLY_ADJUSTED: 'manually_adjusted',
  REJECTED: 'rejected',
}

export const PRICING_STATUS_LABEL = {
  [PRICING_STATUS.NOT_CALCULATED]: 'Ej beräknat',
  [PRICING_STATUS.AI_CALCULATED]: 'AI-förslag',
  [PRICING_STATUS.NEEDS_REVIEW]: 'Behöver granskas',
  [PRICING_STATUS.APPROVED]: 'Godkänt',
  [PRICING_STATUS.MANUALLY_ADJUSTED]: 'Manuellt justerat',
  [PRICING_STATUS.REJECTED]: 'Avvisat',
}

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

export async function getGarmentPricing(jobId, garment) {
  const rows = await getJobPricing(jobId)
  return rows.find((row) => row.garmentId === garment.id && !row.groupId)
}

export async function getGroupPricing(jobId, group) {
  const rows = await getJobPricing(jobId)
  return rows.find((row) => row.groupId === group.id)
}

export async function getProjectPricing(jobId, garments) {
  const rows = await getJobPricing(jobId)
  return garments.map((garment) => rows.find((row) => row.garmentId === garment.id && !row.groupId)).filter(Boolean)
}

export async function listAllPricing() {
  return listPricing()
}

export async function approvePricing(pricingId, { note } = {}) {
  return approvePricingApi(pricingId, { note })
}

export async function updatePricing(pricingId, payload = {}) {
  return updatePricingApi(pricingId, payload)
}

export async function rejectPricing(pricingId, { note } = {}) {
  return rejectPricingApi(pricingId, { note })
}

export async function getPricingHistory(pricingId) {
  return getPricingHistoryApi(pricingId)
}
