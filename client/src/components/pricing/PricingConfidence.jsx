import { AlertTriangle } from 'lucide-react'

export default function PricingConfidence({ value = 0 }) {
  const pct = Math.round(value * 100)
  const low = value < 0.65
  const tone = pct >= 80 ? 'bg-emerald-500' : pct >= 65 ? 'bg-brand-500' : 'bg-amber-500'
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-semibold text-slate-600">{pct} %</span>
      </div>
      {low && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Låg säkerhet – kontrollera priset manuellt
        </p>
      )}
    </div>
  )
}
