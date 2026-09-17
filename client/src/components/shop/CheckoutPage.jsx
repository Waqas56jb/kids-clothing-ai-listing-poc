import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CreditCard, Lock, ShoppingCart } from 'lucide-react'
import { toast } from 'react-toastify'
import { getCart, startCheckout, storageUrl } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { refreshCounts } from '../../lib/useCounts'
import { formatSek, plural } from '../../lib/sv'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

const inputClass =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-soft outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100'

const STORAGE_KEY = 'miniplagg-shipping'

function loadSavedShipping() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {}
  } catch {
    return {}
  }
}

export default function CheckoutPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { profile, user } = useAuth()
  const [cart, setCart] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [shipping, setShipping] = useState(() => ({
    name: '',
    email: '',
    phone: '',
    address: '',
    postal_code: '',
    city: '',
    ...loadSavedShipping(),
  }))
  const [paymentMethod, setPaymentMethod] = useState('stripe')

  useEffect(() => {
    getCart()
      .then((data) => {
        setCart(data)
        setPaymentMethod(data.stripe_enabled ? 'stripe' : 'test')
      })
      .catch((err) => toast.error(err.message || 'Kunde inte hämta varukorgen'))
  }, [])

  useEffect(() => {
    setShipping((prev) => ({
      ...prev,
      name: prev.name || profile?.full_name || '',
      email: prev.email || user?.email || '',
    }))
  }, [profile, user])

  useEffect(() => {
    if (params.get('avbruten')) toast.info('Betalningen avbröts – din varukorg finns kvar.')
  }, [params])

  const set = (key) => (event) => setShipping((prev) => ({ ...prev, [key]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(shipping))
      const result = await startCheckout({ shipping, paymentMethod })
      refreshCounts()
      if (result.checkout_url) {
        window.location.href = result.checkout_url
        return
      }
      navigate(`/kassa/betala/${result.order.id}`)
    } catch (err) {
      toast.error(err.message || 'Kunde inte starta kassan')
      setSubmitting(false)
    }
  }

  if (cart === null) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-3 px-4 py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const available = cart.items.filter((item) => item.available)
  if (available.length === 0 || available.length !== cart.items.length) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12">
        <EmptyState
          icon={ShoppingCart}
          title={cart.items.length === 0 ? 'Varukorgen är tom' : 'Något i varukorgen är inte tillgängligt'}
          description={cart.items.length === 0 ? 'Lägg något i varukorgen innan du går till kassan.' : 'Ta bort plagg som inte längre går att köpa och försök igen.'}
          action={
            <Link to={cart.items.length === 0 ? '/marknad' : '/varukorg'}>
              <Button>{cart.items.length === 0 ? 'Till marknaden' : 'Till varukorgen'}</Button>
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
      <h1 className="font-display text-3xl font-semibold text-ink">Kassa</h1>
      <p className="mt-1 text-sm text-slate-500">Fyll i leveransuppgifter och betala – säljaren får dina uppgifter direkt när betalningen är klar.</p>

      <form onSubmit={submit} className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold text-ink">Leveransuppgifter</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Namn</span>
                <input required value={shipping.name} onChange={set('name')} className={inputClass} autoComplete="name" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">E-post</span>
                <input required type="email" value={shipping.email} onChange={set('email')} className={inputClass} autoComplete="email" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Telefon</span>
                <input value={shipping.phone} onChange={set('phone')} className={inputClass} autoComplete="tel" placeholder="07x-xxx xx xx" />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Adress</span>
                <input required value={shipping.address} onChange={set('address')} className={inputClass} autoComplete="street-address" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Postnummer</span>
                <input required value={shipping.postal_code} onChange={set('postal_code')} className={inputClass} autoComplete="postal-code" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ort</span>
                <input required value={shipping.city} onChange={set('city')} className={inputClass} autoComplete="address-level2" />
              </label>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold text-ink">Betalning</h2>
            <div className="mt-4 space-y-2">
              {cart.stripe_enabled && (
                <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 ${paymentMethod === 'stripe' ? 'border-moss bg-moss-soft/40' : 'border-slate-200'}`}>
                  <input type="radio" name="payment" checked={paymentMethod === 'stripe'} onChange={() => setPaymentMethod('stripe')} />
                  <CreditCard className="h-5 w-5 text-moss" />
                  <span>
                    <span className="block text-sm font-semibold text-ink">Kort (Stripe)</span>
                    <span className="text-xs text-slate-500">Säker kortbetalning – du skickas till Stripe och tillbaka hit.</span>
                  </span>
                </label>
              )}
              <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 ${paymentMethod === 'test' ? 'border-moss bg-moss-soft/40' : 'border-slate-200'}`}>
                <input type="radio" name="payment" checked={paymentMethod === 'test'} onChange={() => setPaymentMethod('test')} />
                <Lock className="h-5 w-5 text-moss" />
                <span>
                  <span className="block text-sm font-semibold text-ink">{cart.stripe_enabled ? 'Testbetalning' : 'Kortbetalning (testläge)'}</span>
                  <span className="text-xs text-slate-500">
                    {cart.stripe_enabled ? 'Genomför köpet utan riktig debitering.' : 'Ingen riktig debitering sker förrän en betalleverantör är kopplad.'}
                  </span>
                </span>
              </label>
            </div>
          </Card>
        </div>

        <Card className="h-fit p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Din beställning</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {available.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-sand">
                  {item.cover_image && <img src={storageUrl(item.cover_image)} alt="" className="h-full w-full object-contain p-1" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                  <span className="text-xs text-slate-500">{item.seller_name ? `Säljs av ${item.seller_name}` : ''}</span>
                </span>
                <span className="text-sm font-semibold text-ink">{formatSek(item.cart_price)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-base font-semibold text-ink">
            <span>
              Att betala ({available.length} {plural(available.length, 'plagg', 'plagg')})
            </span>
            <span>{formatSek(cart.total)}</span>
          </div>
          <Button type="submit" size="lg" className="mt-5 w-full" disabled={submitting}>
            {submitting ? 'Startar betalning…' : `Betala ${formatSek(cart.total)}`}
          </Button>
          <p className="mt-3 text-center text-[11px] text-slate-400">Genom att betala godkänner du att säljaren får dina leveransuppgifter.</p>
        </Card>
      </form>
    </div>
  )
}
