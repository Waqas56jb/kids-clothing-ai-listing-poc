import Badge from '../ui/Badge'
import { PRICING_STATUS, PRICING_STATUS_LABEL } from '../../lib/pricing'

const TONE = {
  [PRICING_STATUS.NOT_CALCULATED]: 'neutral',
  [PRICING_STATUS.AI_CALCULATED]: 'info',
  [PRICING_STATUS.NEEDS_REVIEW]: 'ok',
  [PRICING_STATUS.APPROVED]: 'good',
  [PRICING_STATUS.MANUALLY_ADJUSTED]: 'info',
  [PRICING_STATUS.REJECTED]: 'bad',
}

export default function PricingStatusBadge({ status, className }) {
  return (
    <Badge tone={TONE[status] ?? 'neutral'} className={className}>
      {PRICING_STATUS_LABEL[status] ?? status}
    </Badge>
  )
}
