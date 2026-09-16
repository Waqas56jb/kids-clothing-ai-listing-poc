import { useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import Button from '../ui/Button'
import Card from '../ui/Card'
import PricingRange from './PricingRange'
import PricingConfidence from './PricingConfidence'
import PricingStatusBadge from './PricingStatus'
import PricingEditor from './PricingEditor'
import { PRICING_STATUS } from '../../lib/pricing'

/** "Prisförslag" card -- the AI numbers are never presented as final; only
 * `finalPrice` (set by a human action) is the price used in the listing. */
export default function PricingCard({ pricing, title = 'Prisförslag', onApprove, onSave, className = '' }) {
  const [editing, setEditing] = useState(false)
  if (!pricing) return null

  const isFinal = pricing.status === PRICING_STATUS.APPROVED || pricing.status === PRICING_STATUS.MANUALLY_ADJUSTED

  return (
    <Card className={`p-5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold text-slate-800">{title}</h3>
        <PricingStatusBadge status={pricing.status} />
      </div>

      {editing ? (
        <PricingEditor
          pricing={pricing}
          onCancel={() => setEditing(false)}
          onSave={async (payload) => {
            await onSave(payload)
            setEditing(false)
          }}
        />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">AI:s prisintervall</p>
              <PricingRange min={pricing.minPrice} max={pricing.maxPrice} currency={pricing.currency} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">AI-förslag</p>
              <p className="font-display text-lg font-bold text-brand-700">
                {pricing.recommendedPrice} <span className="text-xs font-semibold text-brand-400">kr</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Säkerhet</p>
              <PricingConfidence value={pricing.confidence} />
            </div>
          </div>

          {pricing.reason && <p className="mt-3 text-xs text-slate-400">{pricing.reason}</p>}

          {isFinal && (
            <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              Slutpris: <strong>{pricing.finalPrice} kr</strong>
              {pricing.adjustedBy && <span className="text-emerald-600"> · satt av {pricing.adjustedBy}</span>}
            </div>
          )}

          {pricing.note && <p className="mt-3 text-sm text-slate-500">Anteckning: {pricing.note}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            {!isFinal && (
              <Button size="sm" onClick={onApprove}>
                <Check className="h-3.5 w-3.5" /> Godkänn förslaget
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Ändra pris
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
