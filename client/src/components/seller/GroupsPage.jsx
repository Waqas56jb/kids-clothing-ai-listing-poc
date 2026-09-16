import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, Package, X } from 'lucide-react'
import { toast } from 'react-toastify'
import { fileUrl, getJob, patchWorkspace } from '../../api'
import { computeInitialGroups, mergeGroups, removeFromGroup, splitGroup } from '../../lib/groups'
import { garmentImagePath } from '../../lib/garment'
import { categoryLabel } from '../../lib/sv'
import { approvePricing, getGroupPricing, updatePricing } from '../../lib/pricing'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import BundlePricingCard from '../pricing/BundlePricingCard'

function GroupPricing({ jobId, group }) {
  const [pricing, setPricing] = useState(null)

  useEffect(() => {
    let active = true
    getGroupPricing(jobId, group)
      .then((p) => {
        if (active) setPricing(p)
      })
      .catch((err) => console.error(err))
    return () => {
      active = false
    }
  }, [jobId, group])

  if (!pricing) return null

  return (
    <div className="mt-4">
      <BundlePricingCard
        pricing={pricing}
        itemCount={group.garmentIds.length}
        onApprove={async () => {
          setPricing(await approvePricing(pricing.id))
          toast.success('Paketpriset är godkänt som slutpris.')
        }}
        onSave={async (payload) => {
          setPricing(await updatePricing(pricing.id, payload))
          toast.success('Paketpriset är sparat.')
        }}
      />
    </div>
  )
}

function Thumb({ jobId, garment }) {
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface shadow-soft" title={categoryLabel(garment.category)}>
      <img src={fileUrl(jobId, garmentImagePath(garment))} alt={categoryLabel(garment.category)} className="h-full w-full object-contain p-1" />
    </div>
  )
}

export default function GroupsPage() {
  const { jobId } = useParams()
  const [garments, setGarments] = useState(null)
  const [groups, setGroups] = useState([])
  const [ungrouped, setUngrouped] = useState([])
  const [error, setError] = useState(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError(null)
    getJob(jobId)
      .then((data) => {
        if (cancelled) return
        const list = data.result?.garments ?? []
        setGarments(list)
        const saved = data.workspace?.groups
        if (saved?.groups) {
          setGroups(saved.groups)
          setUngrouped(saved.ungrouped ?? [])
        } else {
          const initial = computeInitialGroups(list)
          setGroups(initial.groups)
          setUngrouped(initial.ungrouped)
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.error(err)
        setError(err.message || 'Kunde inte hämta omgången')
      })
    return () => {
      cancelled = true
    }
  }, [jobId, retryKey])

  const byId = useMemo(() => Object.fromEntries((garments ?? []).map((g) => [g.id, g])), [garments])

  async function persistGroups(nextGroups, nextUngrouped) {
    setGroups(nextGroups)
    if (nextUngrouped) setUngrouped(nextUngrouped)
    try {
      await patchWorkspace(jobId, { groups: { groups: nextGroups, ungrouped: nextUngrouped ?? ungrouped } })
    } catch (err) {
      toast.error(err.message || 'Kunde inte spara paketen')
    }
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
        <EmptyState icon={AlertTriangle} title="Kunde inte visa omgången" description={error} action={<Button onClick={() => setRetryKey((k) => k + 1)}>Försök igen</Button>} />
      </div>
    )
  }

  if (garments === null) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10 space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
      <Link to={`/results/${jobId}`} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Tillbaka till resultaten
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">Föreslagna paket</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Plaggen grupperas efter storlek och kategori. Dela, slå ihop eller ta bort – alla ändringar sparas.
      </p>

      <div className="mt-8 space-y-4">
        <AnimatePresence>
          {groups.length === 0 ? (
            <EmptyState icon={Package} title="Inga paketförslag" description="Det finns inte tillräckligt många liknande plagg för att föreslå ett paket." />
          ) : (
            groups.map((group) => (
              <motion.div
                key={group.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="rounded-2xl bg-white p-5 shadow-soft"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-slate-800">
                      {group.garmentIds.length} × {categoryLabel(group.category)}
                    </h3>
                    <p className="text-xs text-slate-400">Storlek: {group.size}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => persistGroups(splitGroup(groups, group.id))}>
                      Dela upp
                    </Button>
                    {groups.length > 1 && (
                      <select
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600"
                        value=""
                        onChange={(event) => {
                          if (!event.target.value) return
                          persistGroups(mergeGroups(groups, group.id, event.target.value))
                          toast.success('Paketen slogs ihop.')
                        }}
                      >
                        <option value="">Slå ihop med…</option>
                        {groups
                          .filter((g) => g.id !== group.id)
                          .map((g) => (
                            <option key={g.id} value={g.id}>
                              {categoryLabel(g.category)} ({g.size})
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  {group.garmentIds.map((id) => {
                    const garment = byId[id]
                    if (!garment) return null
                    return (
                      <div key={id} className="group relative">
                        <Thumb jobId={jobId} garment={garment} />
                        <button
                          onClick={() => {
                            const next = removeFromGroup(groups, ungrouped, group.id, id)
                            persistGroups(next.groups, next.ungrouped)
                          }}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/70 text-white opacity-0 transition group-hover:opacity-100"
                          aria-label="Ta bort från paketet"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>

                <GroupPricing jobId={jobId} group={group} />
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {ungrouped.length > 0 && (
        <div className="mt-10">
          <h2 className="font-display text-lg font-bold text-slate-800">Plagg utan paket ({ungrouped.length})</h2>
          <p className="mt-1 text-sm text-slate-500">Säljs var för sig – inget passande paket hittades.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {ungrouped.map((id) => (byId[id] ? <Thumb key={id} jobId={jobId} garment={byId[id]} /> : null))}
          </div>
        </div>
      )}
    </div>
  )
}
