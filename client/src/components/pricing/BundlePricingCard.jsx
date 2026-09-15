import { useState } from 'react'
import { Check, Pencil, Package } from 'lucide-react'
import Button from '../ui/Button'
import Card from '../ui/Card'
import PricingRange from './PricingRange'
import PricingConfidence from './PricingConfidence'
import PricingStatusBadge from './PricingStatus'
import PricingEditor from './PricingEditor'
import { PRICING_STATUS } from '../../lib/pricing'

/** Package/bundle pricing -- the same recommendation shape as a single
 * garment, but scoped to a whole group so a seller is never forced to
 * price a bundle as N separate individual items. */
export default function BundlePricingCard({ pricing, itemCount, onApprove, onSave, className = '' }) {
  const [editing, setEditing] = useState(false)
  if (!pricing) return null

  const isFinal = pricing.status === PRICING_STATUS.APPROVED || pricing.status === PRICING_STATUS.MANUALLY_ADJUSTED

  return (
    <Card className={`p-5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Package className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-base font-bold text-slate-800">Package Pricing</h3>
            <p className="text-xs text-slate-400">{itemCount ?? pricing.meta?.itemCount ?? 1} items priced as one bundle</p>
          </div>
        </div>
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
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">AI Suggested Range</p>
              <PricingRange min={pricing.minPrice} max={pricing.maxPrice} currency={pricing.currency} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">AI Recommended</p>
              <p className="font-display text-lg font-bold text-brand-700">
                {pricing.recommendedPrice} <span className="text-xs font-semibold text-brand-400">{pricing.currency}</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Confidence</p>
              <PricingConfidence value={pricing.confidence} />
            </div>
          </div>

          {isFinal && (
            <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              Final bundle price: <strong>{pricing.finalPrice} {pricing.currency}</strong>
              {pricing.adjustedBy && <span className="text-emerald-600"> · set by {pricing.adjustedBy}</span>}
            </div>
          )}

          {pricing.note && <p className="mt-3 text-sm text-slate-500">Note: {pricing.note}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            {!isFinal && (
              <Button size="sm" onClick={onApprove}>
                <Check className="h-3.5 w-3.5" /> Accept Recommendation
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit Bundle Price
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
