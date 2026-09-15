// Shared presentation logic for garment data, reused across the seller
// results grid, garment detail page, and every admin garment/matching view
// -- kept in one place so "how do we badge a condition/match status" never
// drifts between screens.

export function toneForCondition(condition, hasDefects) {
  // Any AI-flagged possible damage is a suggestion for the seller to check,
  // never a settled fact -- so it's styled as "needs review" (amber), not
  // as a confident negative claim (red).
  if (hasDefects) return 'ok'
  if (!condition) return 'neutral'
  const c = condition.toLowerCase()
  if (c === 'worn') return 'bad'
  if (c === 'fair') return 'ok'
  return 'good'
}

export function toneForMatch(status) {
  if (status === 'high_confidence') return 'good'
  if (status === 'medium_confidence') return 'ok'
  return 'bad'
}

export function conditionLabel(garment) {
  return garment.defects ? 'Needs review' : (garment.condition ?? 'unknown')
}

export function needsAnyReview(garment) {
  return Boolean(garment.defects) || garment.match_status === 'needs_review'
}

export function primaryImage(jobId, garment, fileUrl) {
  return fileUrl(jobId, `debug/masks/${garment.detection_ids[0]}_masked.png`)
}
