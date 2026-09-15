import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { getPricingHistory } from '../../lib/pricing'

export default function PricingHistory({ pricingId }) {
  const [entries, setEntries] = useState(null)

  useEffect(() => {
    let active = true
    getPricingHistory(pricingId).then((list) => {
      if (active) setEntries(list)
    })
    return () => {
      active = false
    }
  }, [pricingId])

  if (!entries) return null

  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
        <History className="h-4 w-4" /> Pricing History
      </div>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">No price changes yet -- still at the AI-calculated recommendation.</p>
      ) : (
        <ol className="mt-3 space-y-3 border-l-2 border-slate-100 pl-4">
          {[...entries].reverse().map((entry) => (
            <li key={entry.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500" />
              <p className="text-sm text-slate-700">
                <strong>{entry.changedBy}</strong>{' '}
                {entry.newPrice == null
                  ? 'rejected the recommendation'
                  : entry.previousPrice != null
                    ? `changed price from ${entry.previousPrice} to ${entry.newPrice} SEK`
                    : `set the price to ${entry.newPrice} SEK`}
              </p>
              {entry.reason && <p className="text-xs text-slate-400">{entry.reason}</p>}
              <p className="text-xs text-slate-300">{new Date(entry.date).toLocaleString()}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
