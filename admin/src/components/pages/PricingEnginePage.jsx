import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { AlertTriangle, Banknote, CheckCircle2, Pencil, Tag } from 'lucide-react'
import { getJob, listJobs } from '../../api'
import { computeInitialGroups } from '../../lib/groups'
import {
  approvePricing,
  getGroupPricing,
  getProjectPricing,
  MOCK_CATEGORY_BASE_RANGES,
  PRICING_STATUS,
} from '../../lib/pricing'
import { categoryLabel } from '../../lib/sv'
import Card from '../ui/Card'
import StatCard from '../ui/StatCard'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import Tabs from '../ui/Tabs'
import PricingTable from '../pricing/PricingTable'
import BundlePricingCard from '../pricing/BundlePricingCard'

const TABS = [
  { value: 'garments', label: 'Plagg' },
  { value: 'packages', label: 'Paket' },
  { value: 'rules', label: 'Prisregler' },
]

export default function PricingEnginePage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [packages, setPackages] = useState([])
  const [tab, setTab] = useState('garments')

  async function load() {
    const jobs = await listJobs().catch(() => [])
    const done = jobs.filter((j) => j.status === 'done')
    const details = await Promise.all(done.map((j) => getJob(j.job_id)))

    const garmentRows = []
    const packageRows = []

    for (const job of details) {
      const garments = job.result?.garments ?? []
      const pricings = await getProjectPricing(job.job_id, garments)
      garments.forEach((garment, i) => {
        garmentRows.push({
          id: pricings[i].id,
          jobId: job.job_id,
          detectionId: garment.detection_ids[0],
          projectName: job.job_id.slice(0, 10),
          garmentLabel: categoryLabel(garment.category),
          category: garment.category,
          brand: garment.brand,
          size: garment.size,
          // Key, not label: PricingTable maps 'needs review' and condition keys to Swedish.
          condition: garment.defects ? 'needs review' : garment.condition,
          pricing: pricings[i],
        })
      })

      const savedGroups = job.workspace?.groups?.groups
      const { groups } = savedGroups ? { groups: savedGroups } : computeInitialGroups(garments)
      const groupPricings = await Promise.all(groups.map((g) => getGroupPricing(job.job_id, g)))
      groups.forEach((group, i) => {
        packageRows.push({ jobId: job.job_id, projectName: job.job_id.slice(0, 10), group, pricing: groupPricings[i] })
      })
    }

    setRows(garmentRows)
    setPackages(packageRows)
  }

  useEffect(() => {
    load()
  }, [])

  const stats = useMemo(() => {
    const all = [...(rows ?? []).map((r) => r.pricing), ...packages.map((p) => p.pricing)]
    return {
      total: all.length,
      pendingReview: all.filter((p) => p.status === PRICING_STATUS.NEEDS_REVIEW).length,
      approved: all.filter((p) => p.status === PRICING_STATUS.APPROVED).length,
      manuallyAdjusted: all.filter((p) => p.status === PRICING_STATUS.MANUALLY_ADJUSTED).length,
      lowConfidence: all.filter((p) => p.confidence < 0.65).length,
    }
  }, [rows, packages])

  if (rows === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">Prismotor</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Priserna sparas centralt. Godkänn, justera eller avvisa – säljare och admin ser samma uppgifter.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Prisförslag totalt" value={stats.total} icon={Banknote} tone="brand" />
        <StatCard label="Väntar på granskning" value={stats.pendingReview} icon={AlertTriangle} tone="amber" />
        <StatCard label="Godkända" value={stats.approved} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Manuellt justerade" value={stats.manuallyAdjusted} icon={Pencil} tone="brand" />
        <StatCard label="Låg säkerhet" value={stats.lowConfidence} icon={Tag} tone="rose" />
      </div>

      <div className="mt-8">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {tab === 'garments' && (
        <div className="mt-4">
          {rows.length === 0 ? (
            <EmptyState icon={Banknote} title="Inga prisförslag för plagg än" description="Färdiga projekt visas här." />
          ) : (
            <PricingTable
              rows={rows}
              onReview={(row) => navigate(`/pricing/garment/${row.jobId}/${row.detectionId}`)}
              onApprove={async (row) => {
                await approvePricing(row.pricing.id, { actor: 'Admin' })
                toast.success('Priset är godkänt.')
                load()
              }}
            />
          )}
        </div>
      )}

      {tab === 'packages' && (
        <div className="mt-4">
          {packages.length === 0 ? (
            <EmptyState icon={Tag} title="Inga paketförslag än" description="Grupper av liknande plagg prissätts som paket här." />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {packages.map((pkg) => (
                <div key={pkg.pricing.id} onClick={() => navigate(`/pricing/group/${pkg.jobId}/${pkg.group.id}`)} className="cursor-pointer">
                  <BundlePricingCard
                    pricing={pkg.pricing}
                    itemCount={pkg.group.garmentIds.length}
                    onApprove={async (event) => {
                      event?.stopPropagation?.()
                      await approvePricing(pkg.pricing.id, { actor: 'Admin' })
                      toast.success('Paketpriset är godkänt.')
                      load()
                    }}
                    onSave={() => navigate(`/pricing/group/${pkg.jobId}/${pkg.group.id}`)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'rules' && (
        <div className="mt-4">
          <Card className="p-5">
            <h2 className="font-display text-base font-bold text-slate-800">Prisregler</h2>
            <p className="mt-1 text-sm text-slate-500">
              Illustrativa basprisintervall (kr) per kategori som används av den här tjänsten så att förslagen blir
              konsekventa. Detta är <strong>inte</strong> den slutgiltiga prismotorn – riktiga prisregler och datakällor
              kopplas in i milstolpe 4.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(MOCK_CATEGORY_BASE_RANGES)
                .filter(([key]) => key !== 'default')
                .map(([category, [min, max]]) => (
                  <div key={category} className="rounded-xl bg-surface/60 p-3">
                    <p className="text-xs font-semibold text-slate-500">{categoryLabel(category)}</p>
                    <p className="mt-1 font-display text-sm font-bold text-slate-800">
                      {min}–{max} <span className="text-xs font-semibold text-slate-400">kr</span>
                    </p>
                  </div>
                ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
