import { motion } from 'framer-motion'

const TONES = {
  brand: 'bg-brand-50 text-brand-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
}

export default function StatCard({ label, value, hint, icon: Icon, tone = 'brand' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      className="rounded-3xl border border-white/80 bg-white/90 p-4 shadow-soft backdrop-blur-sm sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
        {Icon && (
          <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${TONES[tone] ?? TONES.brand}`}>
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
        )}
      </div>
      <p className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl">{value}</p>
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{hint}</p>}
    </motion.div>
  )
}
