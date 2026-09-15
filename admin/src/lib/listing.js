// Templated listing copy from real attributes -- a stand-in for the real
// LLM listing-generation step (no such endpoint exists yet). Never invents
// a brand/size/color that wasn't actually detected.
function titleCase(text) {
  return text.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function generateTitle(garment) {
  const parts = [garment.brand, garment.color, titleCase(garment.category)].filter(Boolean)
  return parts.length ? parts.join(' ') : `Kids ${titleCase(garment.category)}`
}

export function generateDescription(garment) {
  const lines = []
  if (garment.brand) lines.push(`Brand: ${garment.brand}`)
  if (garment.size) lines.push(`Size: ${garment.size}`)
  if (garment.color) lines.push(`Color: ${garment.color}`)
  lines.push(`Condition: ${garment.defects ? 'please verify — AI flagged possible wear' : (garment.condition ?? 'good')}`)
  if (garment.gender) lines.push(`Gender: ${garment.gender}`)
  return `${generateTitle(garment)}, in ${garment.defects ? 'good' : (garment.condition ?? 'good')} pre-loved condition.\n\n${lines.join('\n')}`
}
