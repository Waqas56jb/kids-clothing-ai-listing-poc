import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellOff, BellRing, CheckCheck } from 'lucide-react'
import { toast } from 'react-toastify'
import { listNotifications, markNotificationsRead } from '../../api'
import { refreshCounts } from '../../lib/useCounts'
import { currentPushSubscription, disablePush, enablePush, pushSupported } from '../../lib/push'
import { notificationKindLabel, timeAgoSv } from '../../lib/sv'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

const KIND_TONE = {
  purchase: 'bg-emerald-50 text-emerald-700',
  sale: 'bg-emerald-50 text-emerald-700',
  offer: 'bg-brand-50 text-brand-700',
  counteroffer: 'bg-amber-50 text-amber-700',
  offer_accepted: 'bg-emerald-50 text-emerald-700',
  offer_declined: 'bg-rose-50 text-rose-700',
  message: 'bg-sand text-ink',
  order_shipped: 'bg-brand-50 text-brand-700',
}

export default function NotificationsPage() {
  const [data, setData] = useState(null)
  const [pushOn, setPushOn] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listNotifications()
      .then((result) => {
        setData(result)
        if (result.unread > 0) {
          markNotificationsRead()
            .then(() => refreshCounts())
            .catch(() => {})
        }
      })
      .catch((err) => toast.error(err.message || 'Kunde inte hämta notiser'))
    currentPushSubscription().then((sub) => setPushOn(Boolean(sub)))
  }, [])

  async function togglePush() {
    setBusy(true)
    try {
      if (pushOn) {
        await disablePush()
        setPushOn(false)
        toast.info('Push-notiser är avstängda på den här enheten.')
      } else {
        await enablePush()
        setPushOn(true)
        toast.success('Push-notiser är på – du får notiser även när Miniplagg är stängt.')
      }
    } catch (err) {
      toast.error(err.message || 'Kunde inte ändra push-inställningen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Notiser</h1>
          <p className="mt-1 text-sm text-slate-500">Köp, bud, motbud, svar på bud, meddelanden och leveranser – allt samlat här.</p>
        </div>
        {pushSupported() ? (
          <Button variant={pushOn ? 'secondary' : 'primary'} onClick={togglePush} disabled={busy || pushOn === null}>
            {pushOn ? <BellOff className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
            {pushOn ? 'Stäng av push på den här enheten' : 'Aktivera push-notiser'}
          </Button>
        ) : (
          <p className="text-xs text-slate-400">Push-notiser stöds inte i den här webbläsaren. På iPhone: lägg till Miniplagg på hemskärmen först.</p>
        )}
      </div>

      {data === null ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : data.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={Bell} title="Inga notiser än" description="När någon köper, lägger bud eller skriver till dig dyker det upp här." />
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {data.items.map((item) => (
            <li key={item.id}>
              <Card className={`p-4 ${item.read_at ? '' : 'ring-2 ring-brand-100'}`}>
                <Link to={item.link || '/notiser'} className="flex items-start gap-3">
                  <span className={`mt-0.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${KIND_TONE[item.kind] ?? 'bg-slate-100 text-slate-600'}`}>
                    {notificationKindLabel(item.kind)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{item.title}</span>
                    {item.body && <span className="block text-sm text-slate-600">{item.body}</span>}
                    <span className="mt-1 block text-xs text-slate-400">{timeAgoSv(item.created_at)}</span>
                  </span>
                  {item.read_at && <CheckCheck className="h-4 w-4 shrink-0 text-slate-300" />}
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
