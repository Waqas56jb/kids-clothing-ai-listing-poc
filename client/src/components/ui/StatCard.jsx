import { motion } from 'framer-motion'

const TONES = {
  brand: 'bg-brand-50 text-brand-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
}

export default function StatCard({ label, value, hint, icon, tone = 'brand' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        {icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${TONES[tone] ?? TONES.brand}`}>
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 font-display text-3xl font-bold text-slate-800">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </motion.div>
  )
}
