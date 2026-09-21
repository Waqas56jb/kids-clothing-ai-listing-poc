import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, PackageCheck } from 'lucide-react'
import { toast } from 'react-toastify'
import { confirmOrder, getOrder, storageUrl } from '../../api'
import { refreshCounts } from '../../lib/useCounts'
import { formatDate, formatSek, orderItemStatusLabel, orderStatusLabel } from '../../lib/sv'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

export default function OrderConfirmationPage() {
  const { orderId } = useParams()
  const [params] = useSearchParams()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const sessionId = params.get('session_id')
    const load = async () => {
      let data = await getOrder(orderId)
      if (data.status !== 'paid' && sessionId) {
        data = await confirmOrder(orderId, sessionId)
        refreshCounts()
      }
      return data
    }
    load()
      .then((data) => !cancelled && setOrder(data))
      .catch((err) => {
        if (cancelled) return
        setError(err.message || 'Ordern hittades inte')
        toast.error(err.message || 'Ordern hittades inte')
      })
    return () => {
      cancelled = true
    }
  }, [orderId, params])

  if (error) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <EmptyState icon={PackageCheck} title="Kunde inte visa ordern" description={error} action={<Link to="/annonser?flik=ordrar"><Button>Mina ordrar</Button></Link>} />
      </div>
    )
  }
  if (!order) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const paid = order.status === 'paid'

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <div className="text-center">
        <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-3xl ${paid ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
          {paid ? <CheckCircle2 className="h-8 w-8" /> : <PackageCheck className="h-8 w-8" />}
        </span>
        <h1 className="mt-4 font-display text-3xl font-semibold text-ink">{paid ? 'Tack för ditt köp!' : 'Betalningen är inte klar'}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {formatDate(order.created_at)} · {orderStatusLabel(order.status)}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">Ordernummer {order.id.slice(0, 8)}</p>
        {paid && <p className="mt-1 text-sm text-slate-500">Vi har meddelat säljaren, som skickar plagget till din adress. Du får en notis när det är skickat.</p>}
        {!paid && (
          <Link to={`/kassa/betala/${order.id}`} className="mt-4 inline-block">
            <Button>Slutför betalningen</Button>
          </Link>
        )}
      </div>

      <Card className="mt-8 p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Plagg</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-3">
              <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-sand">
                {item.cover_image && <img src={storageUrl(item.cover_image)} alt="" className="h-full w-full object-contain p-1" />}
              </span>
              <span className="min-w-0 flex-1">
                <Link to={item.listing_id ? `/marknad/${item.listing_id}` : '#'} className="block truncate text-sm font-semibold text-ink hover:underline">
                  {item.title}
                </Link>
                <span className="text-xs text-slate-500">
                  {item.seller_name ? `Säljs av ${item.seller_name} · ` : ''}
                  {orderItemStatusLabel(item.status)}
                </span>
              </span>
              <span className="text-sm font-semibold text-ink">{formatSek(item.price)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-base font-semibold text-ink">
          <span>Totalt</span>
          <span>{formatSek(order.total)}</span>
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Leveransadress</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
          {[order.shipping.name, order.shipping.address, `${order.shipping.postal_code || ''} ${order.shipping.city || ''}`.trim(), order.shipping.phone, order.shipping.email]
            .filter(Boolean)
            .join('\n')}
        </p>
      </Card>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/annonser?flik=ordrar">
          <Button variant="secondary">Mina ordrar</Button>
        </Link>
        <Link to="/marknad">
          <Button>Fortsätt handla</Button>
        </Link>
      </div>
    </div>
  )
}
