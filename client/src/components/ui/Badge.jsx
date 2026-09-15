const TONES = {
  good: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  ok: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  bad: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  info: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200',
  neutral: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
}

export default function Badge({ tone = 'neutral', className = '', children }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${TONES[tone] ?? TONES.neutral} ${className}`}
    >
      {children}
    </span>
  )
}
