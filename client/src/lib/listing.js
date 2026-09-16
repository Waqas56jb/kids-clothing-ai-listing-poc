// Swedish fallback listing copy built only from detected attributes. The
// backend generates the real AI copy (garment.listing_title/description);
// this is used when a garment predates that or the seller presses "Återställ".
import { categoryLabel, conditionLabel, genderLabel } from './sv'

export function generateTitle(garment) {
  if (garment.listing_title) return garment.listing_title
  const parts = [garment.brand, categoryLabel(garment.category)]
  if (garment.size) parts.push(`stl ${garment.size}`)
  return parts.filter(Boolean).join(' ')
}

export function generateDescription(garment) {
  if (garment.listing_description) return garment.listing_description
  let intro = categoryLabel(garment.category)
  if (garment.brand) intro += ` från ${garment.brand}`
  if (garment.color) intro += ` i ${garment.color}`
  intro += garment.defects
    ? '. Observera: möjligt slitage har noterats – kontrollera plagget innan publicering.'
    : `, ${conditionLabel(garment.condition).toLowerCase()}.`

  const lines = []
  if (garment.brand) lines.push(`Märke: ${garment.brand}`)
  if (garment.size) lines.push(`Storlek: ${garment.size}`)
  if (garment.color) lines.push(`Färg: ${garment.color}`)
  lines.push(`Skick: ${conditionLabel(garment.condition)}`)
  if (garment.defects) lines.push(`Anmärkning: ${garment.defects}`)
  if (garment.gender) lines.push(`Passar: ${genderLabel(garment.gender)}`)
  return `${intro}\n\n${lines.join('\n')}\n\nSkickas snabbt. Fråga gärna om fler bilder.`
}
