// Swedish labels for every enum/key the backend produces. All user-facing
// text in Miniplagg is Swedish; the backend keeps stable English keys so
// pricing rules, grouping and matching stay consistent.

export const BRAND = 'Miniplagg'

export const CATEGORY_SV = {
  bodysuit: 'Body',
  onesie: 'Sparkdräkt',
  romper: 'Jumpsuit',
  sleeper: 'Pyjamas',
  pajamas: 'Pyjamas',
  dress: 'Klänning',
  skirt: 'Kjol',
  't-shirt': 'T-shirt',
  top: 'Topp',
  shirt: 'Skjorta',
  blouse: 'Blus',
  sweater: 'Tröja',
  hoodie: 'Huvtröja',
  sweatshirt: 'Sweatshirt',
  cardigan: 'Kofta',
  jacket: 'Jacka',
  coat: 'Kappa',
  vest: 'Väst',
  trousers: 'Byxor',
  pants: 'Byxor',
  jeans: 'Jeans',
  leggings: 'Leggings',
  shorts: 'Shorts',
  overalls: 'Hängselbyxor',
  socks: 'Strumpor',
  tights: 'Strumpbyxor',
  hat: 'Mössa',
  beanie: 'Mössa',
  mittens: 'Vantar',
  scarf: 'Halsduk',
  shoes: 'Skor',
  swimwear: 'Badkläder',
  accessory: 'Accessoar',
  longsleeve: 'Långärmad tröja',
  other: 'Plagg',
  unknown: 'Plagg',
}

// Ordered list for dropdowns/filters (canonical keys only).
export const CATEGORY_OPTIONS = [
  'bodysuit', 'onesie', 'romper', 'sleeper', 'pajamas', 'dress', 'skirt', 't-shirt', 'top', 'shirt', 'blouse',
  'sweater', 'hoodie', 'sweatshirt', 'cardigan', 'jacket', 'coat', 'vest', 'trousers', 'jeans', 'leggings',
  'shorts', 'overalls', 'socks', 'tights', 'hat', 'beanie', 'mittens', 'scarf', 'shoes', 'swimwear',
  'accessory', 'other',
]

// Quick-browse groups for the marketplace's category strip (one tap browsing,
// Vinted/Blocket-style) -- each maps to several canonical categories at once
// so "Tröjor" catches sweaters, hoodies, cardigans, t-shirts, etc. together.
export const CATEGORY_GROUPS = [
  { key: 'tops', label: 'Tröjor', categories: ['sweater', 'hoodie', 'sweatshirt', 'cardigan', 't-shirt', 'top', 'shirt', 'blouse', 'longsleeve'] },
  { key: 'bottoms', label: 'Byxor', categories: ['trousers', 'pants', 'jeans', 'leggings', 'shorts', 'overalls', 'tights'] },
  { key: 'dresses', label: 'Klänningar', categories: ['dress', 'skirt'] },
  { key: 'bodies', label: 'Bodies', categories: ['bodysuit', 'onesie', 'romper', 'sleeper', 'pajamas'] },
  { key: 'outerwear', label: 'Ytterkläder', categories: ['jacket', 'coat', 'vest'] },
]

export const CONDITION_SV = {
  new: 'Ny',
  'like new': 'Som ny',
  good: 'Bra skick',
  fair: 'Okej skick',
  worn: 'Sliten',
  damaged: 'Skadad',
}
export const CONDITION_OPTIONS = ['new', 'like new', 'good', 'fair', 'worn', 'damaged']

export const GENDER_SV = { boys: 'Pojke', girls: 'Flicka', unisex: 'Unisex' }
export const GENDER_OPTIONS = ['boys', 'girls', 'unisex']

export const MATCH_STATUS_SV = {
  high_confidence: 'Hög säkerhet',
  medium_confidence: 'Medel säkerhet',
  needs_review: 'Behöver granskas',
}

export const JOB_STATUS_SV = {
  queued: 'I kö',
  processing: 'Bearbetas',
  done: 'Klar',
  error: 'Fel',
}

export const PRICING_STATUS_SV = {
  not_calculated: 'Ej beräknat',
  ai_calculated: 'AI-förslag',
  needs_review: 'Behöver granskas',
  approved: 'Godkänt',
  manually_adjusted: 'Manuellt justerat',
  rejected: 'Avvisat',
}

export const LISTING_STATUS_SV = {
  draft: 'Utkast',
  approved: 'Godkänd',
  published: 'Publicerad',
  reserved: 'Reserverad',
  sold: 'Såld',
  unpublished: 'Avpublicerad',
}

export const OFFER_STATUS_SV = {
  pending: 'Väntar på svar',
  countered: 'Motbud lagt',
  accepted: 'Accepterat',
  declined: 'Avböjt',
  cancelled: 'Tillbakadraget',
  completed: 'Betalt',
}

export const ORDER_STATUS_SV = {
  pending_payment: 'Väntar på betalning',
  paid: 'Betald',
  cancelled: 'Avbruten',
}

export const ORDER_ITEM_STATUS_SV = {
  pending: 'Väntar på betalning',
  paid: 'Betald – ska skickas',
  shipped: 'Skickad',
  delivered: 'Levererad',
  cancelled: 'Avbruten',
}

export const NOTIFICATION_KIND_SV = {
  purchase: 'Köp',
  sale: 'Försäljning',
  offer: 'Nytt bud',
  counteroffer: 'Motbud',
  offer_accepted: 'Bud accepterat',
  offer_declined: 'Bud avböjt',
  message: 'Meddelande',
  order_shipped: 'Skickat',
}

export function orderStatusLabel(key) {
  return ORDER_STATUS_SV[key] ?? key
}

export function orderItemStatusLabel(key) {
  return ORDER_ITEM_STATUS_SV[key] ?? key
}

export function notificationKindLabel(key) {
  return NOTIFICATION_KIND_SV[key] ?? 'Notis'
}

export const STAGE_SV = {
  detecting: 'Hittar plagg i bilderna',
  segmenting_extracting: 'Läser etiketter och attribut',
  finishing: 'Matchar plagg och skriver annonstexter',
}

export function categoryLabel(key) {
  if (!key) return 'Plagg'
  return CATEGORY_SV[String(key).toLowerCase()] ?? String(key).replace(/_/g, ' ')
}

export function conditionLabel(key) {
  if (!key) return 'Okänt skick'
  return CONDITION_SV[String(key).toLowerCase()] ?? key
}

export function genderLabel(key) {
  if (!key) return null
  return GENDER_SV[String(key).toLowerCase()] ?? key
}

export function matchStatusLabel(key) {
  return MATCH_STATUS_SV[key] ?? key
}

export function jobStatusLabel(key) {
  return JOB_STATUS_SV[key] ?? key
}

export function pricingStatusLabel(key) {
  return PRICING_STATUS_SV[key] ?? key
}

export function listingStatusLabel(key) {
  return LISTING_STATUS_SV[key] ?? key
}

export function offerStatusLabel(key) {
  return OFFER_STATUS_SV[key] ?? key
}

export function plural(count, singular, pluralForm) {
  return count === 1 ? singular : pluralForm
}

export function formatSek(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—'
  return `${new Intl.NumberFormat('sv-SE').format(Math.round(Number(amount)))} kr`
}

export function formatDate(value) {
  if (!value) return ''
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function timeAgoSv(value) {
  if (!value) return ''
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  const diff = Math.max(0, Date.now() - date.getTime())
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'nyss'
  if (minutes < 60) return `${minutes} min sedan`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} tim sedan`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} ${plural(days, 'dag', 'dagar')} sedan`
  return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium' }).format(date)
}
