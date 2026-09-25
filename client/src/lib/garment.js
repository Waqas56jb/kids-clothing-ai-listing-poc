// Shared presentation logic for garment data, reused across the seller
// results grid, garment detail page, and every admin garment/matching view
// -- kept in one place so "how do we badge a condition/match status" never
// drifts between screens.
import { conditionLabel as conditionKeyLabel } from './sv'

export function toneForCondition(condition, hasDefects) {
  // Any AI-flagged possible damage is a suggestion for the seller to check,
  // never a settled fact -- so it's styled as "needs review" (amber), not
  // as a confident negative claim (red).
  if (hasDefects) return 'ok'
  if (!condition) return 'neutral'
  const c = condition.toLowerCase()
  if (c === 'worn' || c === 'damaged') return 'bad'
  if (c === 'fair') return 'ok'
  return 'good'
}

export function toneForMatch(status) {
  if (status === 'high_confidence') return 'good'
  if (status === 'medium_confidence') return 'ok'
  return 'bad'
}

export function conditionLabel(garment) {
  return garment.defects ? 'Behöver granskas' : conditionKeyLabel(garment.condition)
}

export function needsAnyReview(garment) {
  return Boolean(garment.defects) || garment.match_status === 'needs_review'
}

/**
 * Path (relative to the job's file root) of the image to show for a
 * garment: always the seller's own photo cropped to the garment, never an
 * AI-edited image. Old results without image variants fall back to the
 * legacy mask path.
 */
export function garmentImagePath(garment, { original = false } = {}) {
  if (original && garment.original_image) return garment.original_image
  if (garment.display_image) return garment.display_image
  const first = garment.detection_ids?.[0]
  return first ? `debug/masks/${first}_masked.png` : ''
}

export function detectionImagePath(garment, detectionId, { original = false } = {}) {
  const variant = (garment.image_variants || []).find((v) => v.detection_id === detectionId)
  if (variant) {
    if (original) return variant.original
    return variant.display || variant.crop
  }
  return `debug/masks/${detectionId}_masked.png`
}

export function detectionVariant(garment, detectionId) {
  return (garment.image_variants || []).find((v) => v.detection_id === detectionId) ?? null
}

export function garmentImageUrl(jobId, garment, fileUrl, options) {
  return fileUrl(jobId, garmentImagePath(garment, options))
}

export function primaryImage(jobId, garment, fileUrl) {
  return garmentImageUrl(jobId, garment, fileUrl)
}
