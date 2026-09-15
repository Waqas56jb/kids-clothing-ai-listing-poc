const TONES = {
  good: 'bg-emerald-100 text-emerald-700',
  ok: 'bg-amber-100 text-amber-700',
  bad: 'bg-rose-100 text-rose-700',
  neutral: 'bg-slate-100 text-slate-600',
}

export default function Badge({ tone = 'neutral', children }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${TONES[tone] ?? TONES.neutral}`}
    >
      {children}
    </span>
  )
}
