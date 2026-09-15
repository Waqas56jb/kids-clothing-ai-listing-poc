import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, ImageIcon, Tag } from 'lucide-react'
import { fileUrl } from '../../api'
import Badge from '../ui/Badge'
import { conditionLabel, toneForCondition, toneForMatch } from '../../lib/garment'
import { getGarmentPricing, PRICING_STATUS } from '../../lib/pricing'
import PricingStatusBadge from '../pricing/PricingStatus'

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="truncate font-medium capitalize text-slate-700" title={value}>
        {value}
      </dd>
    </div>
  )
}

export default function GarmentCard({ garment, jobId, index = 0 }) {
  const imageSrc = fileUrl(jobId, `debug/masks/${garment.detection_ids[0]}_masked.png`)
  const [pricing, setPricing] = useState(null)

  useEffect(() => {
    let active = true
    getGarmentPricing(jobId, garment).then((p) => {
      if (active) setPricing(p)
    })
    return () => {
      active = false
    }
  }, [jobId, garment])

  const isFinal = pricing?.status === PRICING_STATUS.APPROVED || pricing?.status === PRICING_STATUS.MANUALLY_ADJUSTED

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4) }}
    >
      <Link
        to={`/garments/${jobId}/${garment.detection_ids[0]}`}
        className="group flex h-full flex-col overflow-hidden rounded-3xl bg-white/90 shadow-soft ring-1 ring-black/5 transition duration-300 hover:-translate-y-1 hover:shadow-elevated"
      >
        <div className="relative aspect-square overflow-hidden bg-sand">
          <img
            src={imageSrc}
            alt={garment.category}
            className="h-full w-full object-contain p-4 transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
          {garment.images.length > 1 && (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-slate-900/60 px-2 py-0.5 text-[11px] font-medium text-white">
              <ImageIcon className="h-3 w-3" /> {garment.images.length}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-lg font-semibold capitalize text-slate-800">
              {garment.category.replace(/_/g, ' ')}
            </h3>
            <Badge tone={toneForMatch(garment.match_status)}>{garment.match_status.replace(/_/g, ' ')}</Badge>
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-slate-600">
            {garment.brand && <Field label="Brand" value={garment.brand} />}
            {garment.size && <Field label="Size" value={garment.size} />}
            {garment.color && <Field label="Color" value={garment.color} />}
            {garment.gender && <Field label="Gender" value={garment.gender} />}
          </dl>

          <div className="mt-auto flex flex-col gap-1.5 border-t border-slate-100 pt-3">
            <Badge tone={toneForCondition(garment.condition, Boolean(garment.defects))}>
              {conditionLabel(garment)}
            </Badge>
            {garment.defects && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>AI flagged possible damage — please verify: {garment.defects}</span>
              </p>
            )}
            {pricing && (
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <Tag className="h-3.5 w-3.5 text-brand-500" />
                  {isFinal ? (
                    <>{pricing.finalPrice} {pricing.currency}</>
                  ) : (
                    <>~{pricing.recommendedPrice} {pricing.currency} <span className="font-normal text-slate-400">(AI)</span></>
                  )}
                </span>
                <PricingStatusBadge status={pricing.status} />
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
