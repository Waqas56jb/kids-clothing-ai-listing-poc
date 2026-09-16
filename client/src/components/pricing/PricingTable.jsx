import { Check, Eye, Pencil } from 'lucide-react'
import { Table, Thead, Th, Tr, Td } from '../ui/Table'
import Button from '../ui/Button'
import PricingStatusBadge from './PricingStatus'
import PricingConfidence from './PricingConfidence'
import { PRICING_STATUS } from '../../lib/pricing'
import { categoryLabel, conditionLabel } from '../../lib/sv'

/**
 * Admin-facing pricing review table.
 * @param {{ rows: Array<{ id: string, projectName?: string, garmentLabel: string, category?: string, brand?: string, size?: string, condition?: string, pricing: object }>, onReview: (row: any) => void, onApprove: (row: any) => void }} props
 */
export default function PricingTable({ rows, onReview, onApprove }) {
  return (
    <Table>
      <Thead>
        <Th>Omgång</Th>
        <Th>Plagg</Th>
        <Th>Kategori</Th>
        <Th>Märke</Th>
        <Th>Storlek</Th>
        <Th>Skick</Th>
        <Th>AI-intervall</Th>
        <Th>AI-förslag</Th>
        <Th>Säkerhet</Th>
        <Th>Slutpris</Th>
        <Th>Status</Th>
        <Th className="text-right">Åtgärd</Th>
      </Thead>
      <tbody>
        {rows.map((row) => {
          const p = row.pricing
          const isFinal = p.status === PRICING_STATUS.APPROVED || p.status === PRICING_STATUS.MANUALLY_ADJUSTED
          return (
            <Tr key={row.id}>
              <Td>{row.projectName ?? '—'}</Td>
              <Td className="font-medium text-slate-800">{row.garmentLabel}</Td>
              <Td>{row.category ? categoryLabel(row.category) : '—'}</Td>
              <Td>{row.brand ?? '—'}</Td>
              <Td>{row.size ?? '—'}</Td>
              <Td>{row.condition === 'needs review' ? 'Behöver granskas' : row.condition ? conditionLabel(row.condition) : '—'}</Td>
              <Td>
                {p.minPrice}–{p.maxPrice} kr
              </Td>
              <Td className="font-semibold text-brand-700">{p.recommendedPrice} kr</Td>
              <Td>
                <PricingConfidence value={p.confidence} />
              </Td>
              <Td className="font-semibold text-slate-800">{isFinal ? `${p.finalPrice} kr` : '—'}</Td>
              <Td>
                <PricingStatusBadge status={p.status} />
              </Td>
              <Td>
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => onReview(row)}>
                    {isFinal ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {isFinal ? 'Ändra' : 'Granska'}
                  </Button>
                  {!isFinal && (
                    <Button size="sm" onClick={() => onApprove(row)}>
                      <Check className="h-3.5 w-3.5" /> Godkänn
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
