export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-brand-100 bg-white/60 px-6 py-16 text-center shadow-soft">
      {Icon && (
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-sand text-brand-700 shadow-soft">
          <Icon className="h-7 w-7" strokeWidth={1.5} />
        </span>
      )}
      <h3 className="mt-5 font-display text-xl font-semibold text-ink">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
