const TONES = {
  good: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100',
  ok: 'bg-amber-50 text-amber-800 ring-1 ring-amber-100',
  bad: 'bg-rose-50 text-rose-800 ring-1 ring-rose-100',
  info: 'bg-brand-50 text-brand-800 ring-1 ring-brand-100',
  neutral: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
}

export default function Badge({ tone = 'neutral', className = '', children }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${TONES[tone] ?? TONES.neutral} ${className}`}
    >
      {children}
    </span>
  )
}
