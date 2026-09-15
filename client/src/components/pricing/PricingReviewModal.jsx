import { useState } from 'react'
import { Check, Ban } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import PricingRange from './PricingRange'
import PricingConfidence from './PricingConfidence'
import PricingStatusBadge from './PricingStatus'
import PricingEditor from './PricingEditor'
import PricingHistory from './PricingHistory'
import { PRICING_STATUS } from '../../lib/pricing'

/**
 * Full review dialog for a single pricing recommendation -- used by admin
 * (and available to the seller flow) to approve, manually reprice, or
 * reject an AI price without leaving the current page.
 */
export default function PricingReviewModal({ open, onClose, pricing, title, onApprove, onSave, onReject, showHistory = true }) {
  const [editing, setEditing] = useState(false)
  if (!pricing) return null

  const isFinal = pricing.status === PRICING_STATUS.APPROVED || pricing.status === PRICING_STATUS.MANUALLY_ADJUSTED

  return (
    <Modal open={open} onClose={onClose} title={title ?? 'Review Pricing Recommendation'}>
      <div className="flex items-center justify-between">
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

          {pricing.reason && <p className="mt-3 text-sm text-slate-500">{pricing.reason}</p>}

          {isFinal && (
            <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              Final price: <strong>{pricing.finalPrice} {pricing.currency}</strong>
              {pricing.adjustedBy && <span className="text-emerald-600"> · set by {pricing.adjustedBy}</span>}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {!isFinal && (
              <Button size="sm" onClick={onApprove}>
                <Check className="h-3.5 w-3.5" /> Approve AI Price
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Set Manual Price
            </Button>
            {pricing.status !== PRICING_STATUS.REJECTED && (
              <Button size="sm" variant="danger" onClick={onReject}>
                <Ban className="h-3.5 w-3.5" /> Reject
              </Button>
            )}
          </div>

          {showHistory && (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <PricingHistory pricingId={pricing.id} />
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
