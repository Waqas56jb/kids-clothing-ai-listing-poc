import GarmentCard from './GarmentCard'

function SummaryPill({ label, count, tone }) {
  if (count === 0) return null
  const dot = { good: 'bg-emerald-500', ok: 'bg-amber-500', bad: 'bg-rose-500' }[tone]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-black/5">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {count} {label}
    </span>
  )
}

export default function ResultsScreen({ result, jobId, onReset }) {
  const garments = result?.garments ?? []
  const counts = garments.reduce((acc, garment) => {
    acc[garment.match_status] = (acc[garment.match_status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">
            {garments.length} Garment{garments.length === 1 ? '' : 's'} Found
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            from {result.total_images} photo{result.total_images > 1 ? 's' : ''} · {result.total_detections}{' '}
            detection{result.total_detections === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="rounded-full border border-brand-300 px-5 py-2.5 text-sm font-semibold text-brand-600 transition hover:bg-brand-50"
        >
          Start new batch
        </button>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
        <SummaryPill label="high confidence" count={counts.high_confidence ?? 0} tone="good" />
        <SummaryPill label="medium confidence" count={counts.medium_confidence ?? 0} tone="ok" />
        <SummaryPill label="need review" count={counts.needs_review ?? 0} tone="bad" />
      </div>

      {result.notes?.length > 0 && (
        <div className="mt-5 space-y-1 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          {result.notes.map((note, index) => (
            <p key={index}>ℹ️ {note}</p>
          ))}
        </div>
      )}

      {garments.length === 0 ? (
        <div className="mt-16 text-center text-slate-400">
          <p className="text-4xl">🤷</p>
          <p className="mt-2">No garments were confidently detected in these photos.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {garments.map((garment) => (
            <GarmentCard key={garment.id} garment={garment} jobId={jobId} />
          ))}
        </div>
      )}
    </div>
  )
}
