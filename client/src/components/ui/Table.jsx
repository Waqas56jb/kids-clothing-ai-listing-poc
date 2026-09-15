export function Table({ children }) {
  return (
    <div className="scrollbar-thin overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-soft">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  )
}

export function Thead({ children }) {
  return (
    <thead className="border-b border-slate-100 bg-slate-50/60 text-xs font-semibold uppercase tracking-wide text-slate-500">
      <tr>{children}</tr>
    </thead>
  )
}

export function Th({ children, className = '' }) {
  return <th className={`px-4 py-3 font-semibold ${className}`}>{children}</th>
}

export function Td({ children, className = '' }) {
  return <td className={`px-4 py-3 align-middle text-slate-700 ${className}`}>{children}</td>
}

export function Tr({ children, className = '', ...props }) {
  return (
    <tr className={`border-b border-slate-50 transition-colors last:border-0 hover:bg-brand-50/40 ${className}`} {...props}>
      {children}
    </tr>
  )
}
