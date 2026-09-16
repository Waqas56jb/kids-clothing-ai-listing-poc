import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { ArrowLeft, Ban, Check } from 'lucide-react'
import { fileUrl, getJob } from '../../api'
import { conditionLabel, detectionImagePath, garmentImagePath } from '../../lib/garment'
import { computeInitialGroups, groupSizeLabel } from '../../lib/groups'
import { approvePricing, getGarmentPricing, getGroupPricing, PRICING_STATUS, rejectPricing, updatePricing } from '../../lib/pricing'
import { categoryLabel, formatDate, genderLabel } from '../../lib/sv'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import PricingRange from '../pricing/PricingRange'
import PricingConfidence from '../pricing/PricingConfidence'
import PricingStatusBadge from '../pricing/PricingStatus'
import PricingEditor from '../pricing/PricingEditor'
import PricingHistory from '../pricing/PricingHistory'

/** Review page for a single pricing recommendation -- a garment
 * (`kind="garment"`) or a group/bundle (`kind="group"`). Same review
 * actions either way: approve the AI price, set a manual price, or
 * reject the recommendation outright. Nothing here ever becomes the
 * final price without one of those explicit human actions. */
export default function PricingDetailPage({ kind }) {
  const { jobId, detectionId, groupId } = useParams()
  const navigate = useNavigate()
  const [subject, setSubject] = useState(null) // { images, title, attrs } for display
  const [pricing, setPricing] = useState(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let cancelled = false
    getJob(jobId).then(async (job) => {
      if (cancelled) return
      const garments = job.result?.garments ?? []

      if (kind === 'garment') {
        const garment = garments.find((g) => g.detection_ids.includes(detectionId))
        if (!garment) return
        setSubject({
          images: garment.detection_ids.map((id) => detectionImagePath(garment, id)),
          title: categoryLabel(garment.category),
          attrs: [
            ['Kategori', categoryLabel(garment.category)],
            ['Märke', garment.brand],
            ['Storlek', garment.size],
            ['Färg', garment.color],
            ['Skick', conditionLabel(garment)],
            ['Passar', genderLabel(garment.gender)],
          ],
        })
        const p = await getGarmentPricing(jobId, garment)
        if (!cancelled) setPricing(p)
      } else {
        const { groups } = computeInitialGroups(garments)
        const group = groups.find((g) => g.id === groupId)
        if (!group) return
        const byId = Object.fromEntries(garments.map((g) => [g.id, g]))
        const members = group.garmentIds.map((id) => byId[id]).filter(Boolean)
        setSubject({
          images: members.map((g) => garmentImagePath(g)),
          title: `${group.garmentIds.length} × ${categoryLabel(group.category)}`,
          attrs: [
            ['Kategori', categoryLabel(group.category)],
            ['Storlek', groupSizeLabel(group.size)],
            ['Plagg i paketet', group.garmentIds.length],
          ],
        })
        const p = await getGroupPricing(jobId, group)
        if (!cancelled) setPricing(p)
      }
    })
    return () => {
      cancelled = true
    }
  }, [jobId, detectionId, groupId, kind])

  const backTo = kind === 'garment' ? '/pricing' : '/pricing'

  if (!subject || !pricing) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  const isFinal = pricing.status === PRICING_STATUS.APPROVED || pricing.status === PRICING_STATUS.MANUALLY_ADJUSTED

  return (
    <div>
      <Link to={backTo} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Tillbaka till prismotorn
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">{subject.title}</h1>
        <PricingStatusBadge status={pricing.status} />
        {kind === 'group' && <Badge tone="info">Paket</Badge>}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {subject.images.map((path, i) => (
              <div key={`${path}-${i}`} className="aspect-square overflow-hidden rounded-2xl bg-white p-2 shadow-soft">
                <img src={fileUrl(jobId, path)} alt="" className="h-full w-full object-contain p-1" />
              </div>
            ))}
          </div>

          <h2 className="mt-6 font-display text-base font-bold text-slate-800">Attribut</h2>
          <dl className="mt-3 space-y-1.5 rounded-2xl bg-white p-4 text-sm shadow-soft">
            {subject.attrs.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 py-1">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-semibold capitalize text-slate-800">{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h2 className="font-display text-base font-bold text-slate-800">Prisförslag</h2>
          <div className="mt-3 rounded-2xl bg-white p-5 shadow-soft">
            {editing ? (
              <PricingEditor
                pricing={pricing}
                onCancel={() => setEditing(false)}
                onSave={async (payload) => {
                  const updated = await updatePricing(pricing.id, { ...payload, actor: 'Admin' })
                  setPricing(updated)
                  setEditing(false)
                  toast.success('Manuellt pris sparat.')
                }}
              />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">AI:s prisintervall</p>
                    <PricingRange min={pricing.minPrice} max={pricing.maxPrice} currency={pricing.currency} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">AI-förslag</p>
                    <p className="font-display text-lg font-bold text-brand-700">
                      {pricing.recommendedPrice} <span className="text-xs font-semibold text-brand-400">kr</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Säkerhet</p>
                    <PricingConfidence value={pricing.confidence} />
                  </div>
                </div>

                {pricing.reason && <p className="mt-3 text-sm text-slate-500">{pricing.reason}</p>}

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Slutpris</p>
                  <p className="font-display text-2xl font-bold text-slate-800">
                    {isFinal ? (
                      <>
                        {pricing.finalPrice} <span className="text-sm font-semibold text-slate-400">kr</span>
                      </>
                    ) : (
                      <span className="text-base font-semibold text-slate-300">Ej satt</span>
                    )}
                  </p>
                  {pricing.adjustedBy && (
                    <p className="text-xs text-slate-400">
                      {pricing.status === PRICING_STATUS.REJECTED ? 'Avvisat' : 'Satt'} av {pricing.adjustedBy} ·{' '}
                      {formatDate(pricing.adjustedAt)}
                    </p>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  {!isFinal && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        setPricing(await approvePricing(pricing.id, { actor: 'Admin' }))
                        toast.success('AI-priset är godkänt.')
                      }}
                    >
                      <Check className="h-3.5 w-3.5" /> Godkänn AI-pris
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                    Sätt manuellt pris
                  </Button>
                  {pricing.status !== PRICING_STATUS.REJECTED && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        setPricing(await rejectPricing(pricing.id, { actor: 'Admin' }))
                        toast.info('Förslaget har avvisats.')
                      }}
                    >
                      <Ban className="h-3.5 w-3.5" /> Avvisa
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => navigate(backTo)}>
                    Tillbaka
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="mt-6 rounded-2xl bg-white p-5 shadow-soft">
            <PricingHistory pricingId={pricing.id} />
          </div>
        </div>
      </div>
    </div>
  )
}
