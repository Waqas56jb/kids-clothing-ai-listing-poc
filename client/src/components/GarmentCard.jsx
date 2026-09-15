import Badge from './Badge'
import { fileUrl } from '../api'

function toneForCondition(condition, hasDefects) {
  // Any AI-flagged possible damage is a suggestion for the seller to check,
  // never a settled fact -- so it's styled as "needs review" (amber), not
  // as a confident negative claim (red). The backend already drops
  // low-confidence damage claims entirely; this is what's left even after
  // that, and it still shouldn't read as more certain than it is.
  if (hasDefects) return 'ok'
  if (!condition) return 'neutral'
  const c = condition.toLowerCase()
  if (c === 'worn') return 'bad'
  if (c === 'fair') return 'ok'
  return 'good'
}

function toneForMatch(status) {
  if (status === 'high_confidence') return 'good'
  if (status === 'medium_confidence') return 'ok'
  return 'bad'
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="truncate font-medium capitalize text-slate-700" title={value}>
        {value}
      </dd>
    </div>
  )
}

export default function GarmentCard({ garment, jobId }) {
  const imageSrc = fileUrl(jobId, `debug/masks/${garment.detection_ids[0]}_masked.png`)

  return (
    <div className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative aspect-square bg-cream-100">
        <img
          src={imageSrc}
          alt={garment.category}
          className="h-full w-full object-contain p-4"
          loading="lazy"
        />
        {garment.images.length > 1 && (
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
            {garment.images.length} photos
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg font-semibold capitalize text-slate-800">
            {garment.category.replace(/_/g, ' ')}
          </h3>
          <Badge tone={toneForMatch(garment.match_status)}>{garment.match_status.replace(/_/g, ' ')}</Badge>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-slate-600">
          {garment.brand && <Field label="Brand" value={garment.brand} />}
          {garment.size && <Field label="Size" value={garment.size} />}
          {garment.color && <Field label="Color" value={garment.color} />}
          {garment.gender && <Field label="Gender" value={garment.gender} />}
        </dl>

        <div className="mt-auto flex flex-col gap-1.5 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={toneForCondition(garment.condition, Boolean(garment.defects))}>
              {garment.defects ? 'Needs review' : (garment.condition ?? 'unknown')}
            </Badge>
          </div>
          {garment.defects && (
            <p className="text-xs text-amber-700">
              ⚠️ AI flagged possible damage — please verify: {garment.defects}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
