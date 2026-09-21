import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BadgeCheck, Banknote, CircleAlert, Landmark, RefreshCw } from 'lucide-react'
import { toast } from 'react-toastify'
import { getConnectOnboardingLink, getConnectStatus, refreshConnectStatus } from '../../api'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Skeleton from '../ui/Skeleton'

export default function PayoutsPage() {
  const [params] = useSearchParams()
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    const load = params.get('klar') ? refreshConnectStatus : getConnectStatus
    load()
      .then(setStatus)
      .catch((err) => setError(err.message || 'Kunde inte hämta status'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function connect() {
    setConnecting(true)
    try {
      const { url } = await getConnectOnboardingLink()
      window.location.href = url
    } catch (err) {
      toast.error(err.message || 'Kunde inte starta anslutningen')
      setConnecting(false)
    }
  }

  async function refresh() {
    try {
      setStatus(await refreshConnectStatus())
      toast.success('Status uppdaterad.')
    } catch (err) {
      toast.error(err.message || 'Kunde inte uppdatera status')
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="font-display text-3xl font-semibold text-ink">Utbetalningar</h1>
      <p className="mt-1 text-sm text-slate-500">
        Anslut ett betalkonto så att pengar från dina sålda plagg betalas ut direkt till dig.
      </p>

      {error && (
        <Card className="mt-6 flex items-center gap-3 p-5 text-sm text-rose-700">
          <CircleAlert className="h-5 w-5 shrink-0" /> {error}
        </Card>
      )}

      {!status && !error && (
        <div className="mt-6">
          <Skeleton className="h-52 w-full" />
        </div>
      )}

      {status && (
        <>
          <Card className="mt-6 p-5 sm:p-6">
            {!status.connected ? (
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-moss-soft text-moss">
                    <Landmark className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-ink">Inget betalkonto anslutet än</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Tar ett par minuter. Du fyller i dina uppgifter direkt hos vår betalleverantör Stripe.
                    </p>
                  </div>
                </div>
                <Button onClick={connect} disabled={connecting} className="shrink-0">
                  {connecting ? 'Öppnar…' : 'Anslut betalkonto'}
                </Button>
              </div>
            ) : status.payouts_enabled ? (
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <BadgeCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-ink">Betalkonto anslutet</p>
                  <p className="mt-1 text-sm text-slate-500">Du får dina pengar automatiskt när ett plagg blir betalt.</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                    <CircleAlert className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-ink">Anslutningen är inte klar</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Stripe behöver några fler uppgifter innan utbetalningar kan starta. Sålda plagg betalas ut så
                      snart det är klart.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" onClick={refresh}>
                    <RefreshCw className="h-4 w-4" /> Uppdatera
                  </Button>
                  <Button onClick={connect} disabled={connecting}>
                    {connecting ? 'Öppnar…' : 'Fortsätt'}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card className="mt-4 flex items-start gap-3 p-5 text-sm text-slate-600">
            <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <p>
              Miniplagg tar en serviceavgift på {status.commission_percent}% av varje sålt plagg. Resten betalas ut
              till ditt anslutna konto så snart köparen har betalat.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
