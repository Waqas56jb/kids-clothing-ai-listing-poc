import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { getPricingHistory } from '../../lib/pricing'
import { formatDate } from '../../lib/sv'

export default function PricingHistory({ pricingId }) {
  const [entries, setEntries] = useState(null)

  useEffect(() => {
    let active = true
    getPricingHistory(pricingId)
      .then((list) => {
        if (active) setEntries(list)
      })
      .catch(() => {
        if (active) setEntries([])
      })
    return () => {
      active = false
    }
  }, [pricingId])

  if (!entries) return null

  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
        <History className="h-4 w-4" /> Prishistorik
      </div>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">Inga prisändringar än – fortfarande AI:s förslag.</p>
      ) : (
        <ol className="mt-3 space-y-3 border-l-2 border-slate-100 pl-4">
          {[...entries].reverse().map((entry) => (
            <li key={entry.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500" />
              <p className="text-sm text-slate-700">
                <strong>{entry.changedBy}</strong>{' '}
                {entry.newPrice == null
                  ? 'avvisade förslaget'
                  : entry.previousPrice != null
                    ? `ändrade priset från ${entry.previousPrice} till ${entry.newPrice} kr`
                    : `satte priset till ${entry.newPrice} kr`}
              </p>
              {entry.reason && <p className="text-xs text-slate-400">{entry.reason}</p>}
              <p className="text-xs text-slate-300">{formatDate(entry.date)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
