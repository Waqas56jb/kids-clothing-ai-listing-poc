export default function PricingRange({ min, max, currency = 'SEK', size = 'md' }) {
  const cls = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-lg'
  const unit = currency === 'SEK' ? 'kr' : currency
  return (
    <p className={`font-display font-bold text-slate-800 ${cls}`}>
      {min}–{max} <span className="text-xs font-semibold text-slate-400">{unit}</span>
    </p>
  )
}
