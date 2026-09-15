import { motion } from 'framer-motion'

export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`relative rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
            active === tab.value ? 'text-brand-700' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {active === tab.value && (
            <motion.span
              layoutId="tab-pill"
              className="absolute inset-0 rounded-lg bg-white shadow-soft"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative">{tab.label}</span>
        </button>
      ))}
    </div>
  )
}
