import { Check, Eye, Pencil } from 'lucide-react'
import { Table, Thead, Th, Tr, Td } from '../ui/Table'
import Button from '../ui/Button'
import PricingStatusBadge from './PricingStatus'
import PricingConfidence from './PricingConfidence'
import { PRICING_STATUS } from '../../lib/pricing'

/**
 * Admin-facing pricing review table.
 * @param {{ rows: Array<{ id: string, projectName?: string, garmentLabel: string, category?: string, brand?: string, size?: string, condition?: string, pricing: import('../../lib/pricing').PricingRecommendation }>, onReview: (row: any) => void, onApprove: (row: any) => void }} props
 */
export default function PricingTable({ rows, onReview, onApprove }) {
  return (
    <Table>
      <Thead>
        <Th>Project</Th>
        <Th>Garment</Th>
        <Th>Category</Th>
        <Th>Brand</Th>
        <Th>Size</Th>
        <Th>Condition</Th>
        <Th>AI Price Range</Th>
        <Th>AI Recommended</Th>
        <Th>Confidence</Th>
        <Th>Final Price</Th>
        <Th>Status</Th>
        <Th className="text-right">Action</Th>
      </Thead>
      <tbody>
        {rows.map((row) => {
          const p = row.pricing
          const isFinal = p.status === PRICING_STATUS.APPROVED || p.status === PRICING_STATUS.MANUALLY_ADJUSTED
          return (
            <Tr key={row.id}>
              <Td>{row.projectName ?? '—'}</Td>
              <Td className="font-medium text-slate-800">{row.garmentLabel}</Td>
              <Td className="capitalize">{row.category ?? '—'}</Td>
              <Td>{row.brand ?? '—'}</Td>
              <Td>{row.size ?? '—'}</Td>
              <Td className="capitalize">{row.condition ?? '—'}</Td>
              <Td>
                {p.minPrice}–{p.maxPrice} {p.currency}
              </Td>
              <Td className="font-semibold text-brand-700">
                {p.recommendedPrice} {p.currency}
              </Td>
              <Td>
                <PricingConfidence value={p.confidence} />
              </Td>
              <Td className="font-semibold text-slate-800">{isFinal ? `${p.finalPrice} ${p.currency}` : '—'}</Td>
              <Td>
                <PricingStatusBadge status={p.status} />
              </Td>
              <Td>
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => onReview(row)}>
                    {isFinal ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {isFinal ? 'Edit' : 'Review'}
                  </Button>
                  {!isFinal && (
                    <Button size="sm" onClick={() => onApprove(row)}>
                      <Check className="h-3.5 w-3.5" /> Approve
                    </Button>
                  )}
                </div>
              </Td>
            </Tr>
          )
        })}
      </tbody>
    </Table>
  )
}
