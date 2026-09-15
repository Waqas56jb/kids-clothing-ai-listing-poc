import { useState } from 'react'
import { Save, X } from 'lucide-react'
import { Input } from '../ui/Input'
import Button from '../ui/Button'

export default function PricingEditor({ pricing, onSave, onCancel }) {
  const [minPrice, setMinPrice] = useState(pricing.minPrice)
  const [maxPrice, setMaxPrice] = useState(pricing.maxPrice)
  const [finalPrice, setFinalPrice] = useState(pricing.finalPrice ?? pricing.recommendedPrice)
  const [note, setNote] = useState(pricing.note ?? '')
  const [saving, setSaving] = useState(false)

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Input
          label="Minimum Price"
          type="number"
          value={minPrice}
          onChange={(event) => setMinPrice(Number(event.target.value))}
        />
        <Input
          label="Maximum Price"
          type="number"
          value={maxPrice}
          onChange={(event) => setMaxPrice(Number(event.target.value))}
        />
        <Input
          label="Final Price"
          type="number"
          value={finalPrice}
          onChange={(event) => setFinalPrice(Number(event.target.value))}
        />
      </div>
      <Input
        label="Pricing Note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="e.g. Good condition, known brand"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            await onSave({ minPrice, maxPrice, finalPrice, note })
            setSaving(false)
          }}
        >
          <Save className="h-3.5 w-3.5" /> Save Price
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          <X className="h-3.5 w-3.5" /> Cancel
        </Button>
      </div>
    </div>
  )
}
