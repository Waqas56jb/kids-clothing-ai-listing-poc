import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Lock, ShieldCheck } from 'lucide-react'
import { toast } from 'react-toastify'
import { getOrder, payOrderTest } from '../../api'
import { refreshCounts } from '../../lib/useCounts'
import { formatSek } from '../../lib/sv'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Skeleton from '../ui/Skeleton'

const inputClass =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-soft outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100'

export default function PaymentPage() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [card, setCard] = useState({ holder: '', card_number: '4242 4242 4242 4242', expiry: '12/29', cvc: '123' })
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    getOrder(orderId)
      .then((data) => {
        if (data.status === 'paid') navigate(`/kassa/klart/${orderId}`, { replace: true })
        else setOrder(data)
      })
      .catch((err) => toast.error(err.message || 'Ordern hittades inte'))
  }, [orderId, navigate])

  async function pay(event) {
    event.preventDefault()
    setPaying(true)
    try {
      await payOrderTest(orderId, card)
      refreshCounts()
      navigate(`/kassa/klart/${orderId}`, { replace: true })
    } catch (err) {
      toast.error(err.message || 'Betalningen misslyckades')
      setPaying(false)
    }
  }

  if (!order) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-12">
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:py-14">
      <h1 className="font-display text-3xl font-semibold text-ink">Betala</h1>
      <p className="mt-1 text-sm text-slate-500">
        Att betala {formatSek(order.total)} <span className="text-slate-400">· Ordernummer {order.id.slice(0, 8)}</span>
      </p>

      <Card className="mt-6 p-5 sm:p-6">
        <div className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">
          <strong>Testläge:</strong> ingen riktig debitering sker. Kortuppgifterna nedan är förifyllda testvärden.
        </div>
        <form onSubmit={pay} className="mt-4 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kortinnehavare</span>
            <input value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} className={inputClass} placeholder={order.shipping?.name || 'Namn på kortet'} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kortnummer</span>
            <input required value={card.card_number} onChange={(e) => setCard({ ...card, card_number: e.target.value })} className={inputClass} inputMode="numeric" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Giltigt till</span>
              <input required value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} className={inputClass} placeholder="MM/ÅÅ" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">CVC</span>
              <input required value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} className={inputClass} inputMode="numeric" />
            </label>
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={paying}>
            <Lock className="h-4 w-4" /> {paying ? 'Behandlar…' : `Betala ${formatSek(order.total)}`}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Säljaren får dina leveransuppgifter först när betalningen är klar.
          </p>
        </form>
      </Card>
    </div>
  )
}
