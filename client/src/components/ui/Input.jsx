export function Input({ label, className = '', ...props }) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>}
      <input
        className={`rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-soft outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100 ${className}`}
        {...props}
      />
    </label>
  )
}

export function Select({ label, className = '', children, ...props }) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>}
      <select
        className={`rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-soft outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100 ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  )
}
