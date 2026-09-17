import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ShoppingCart, Trash2 } from 'lucide-react'
import { toast } from 'react-toastify'
import { getCart, removeFromCart, storageUrl } from '../../api'
import { refreshCounts } from '../../lib/useCounts'
import { categoryLabel, formatSek, plural } from '../../lib/sv'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

export default function CartPage() {
  const navigate = useNavigate()
  const [cart, setCart] = useState(null)

  useEffect(() => {
    getCart()
      .then(setCart)
      .catch((err) => toast.error(err.message || 'Kunde inte hämta varukorgen'))
  }, [])

  async function remove(listingId) {
    try {
      setCart(await removeFromCart(listingId))
      refreshCounts()
    } catch (err) {
      toast.error(err.message || 'Kunde inte ta bort')
    }
  }

  if (cart === null) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-3 px-4 py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  const available = cart.items.filter((item) => item.available)

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
      <h1 className="font-display text-3xl font-semibold text-ink">Varukorg</h1>
      <p className="mt-1 text-sm text-slate-500">
        {cart.items.length} {plural(cart.items.length, 'plagg', 'plagg')} · varje plagg är unikt, så det finns bara ett av varje.
      </p>

      {cart.items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={ShoppingCart}
            title="Varukorgen är tom"
            description="Hitta något fint på marknaden och lägg det i varukorgen."
            action={
              <Link to="/marknad">
                <Button>Till marknaden</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {cart.items.map((item) => (
              <Card key={item.id} className="flex items-center gap-4 p-4">
                <Link to={`/marknad/${item.id}`} className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-sand">
                  {item.cover_image && <img src={storageUrl(item.cover_image)} alt="" className="h-full w-full object-contain p-1.5" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/marknad/${item.id}`} className="block truncate font-display text-lg font-semibold text-ink hover:underline">
                    {item.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {[categoryLabel(item.category), item.size ? `stl ${item.size}` : null, item.seller_name ? `säljs av ${item.seller_name}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {!item.available && <p className="mt-1 text-xs font-semibold text-rose-600">Inte längre tillgänglig – ta bort för att gå vidare.</p>}
                  {item.offer_id && item.available && <p className="mt-1 text-xs font-semibold text-emerald-700">Accepterat bud – ditt pris</p>}
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-bold text-moss">{formatSek(item.cart_price)}</p>
                  <button type="button" onClick={() => remove(item.id)} className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-600">
                    <Trash2 className="h-3.5 w-3.5" /> Ta bort
                  </button>
                </div>
              </Card>
            ))}
          </div>

          <Card className="h-fit p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Summering</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between text-slate-500">
                <dt>{available.length} {plural(available.length, 'plagg', 'plagg')}</dt>
                <dd>{formatSek(cart.total)}</dd>
              </div>
              <div className="flex justify-between text-slate-500">
                <dt>Frakt</dt>
                <dd>Enligt överenskommelse med säljaren</dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold text-ink">
                <dt>Att betala</dt>
                <dd>{formatSek(cart.total)}</dd>
              </div>
            </dl>
            <Button className="mt-5 w-full" size="lg" disabled={available.length === 0 || available.length !== cart.items.length} onClick={() => navigate('/kassa')}>
              Till kassan <ArrowRight className="h-4 w-4" />
            </Button>
            <Link to="/marknad" className="mt-3 block text-center text-sm font-semibold text-brand-700 hover:underline">
              Fortsätt handla
            </Link>
          </Card>
        </div>
      )}
    </div>
  )
}
