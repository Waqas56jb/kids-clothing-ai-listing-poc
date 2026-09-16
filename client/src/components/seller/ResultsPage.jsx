import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, Info, Link2, Package, PackageX, Tag } from 'lucide-react'
import { getJob } from '../../api'
import { plural } from '../../lib/sv'
import GarmentCard from './GarmentCard'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

function SummaryPill({ label, count, tone }) {
  if (count === 0) return null
  const dot = { good: 'bg-emerald-500', ok: 'bg-amber-500', bad: 'bg-rose-500' }[tone]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-soft">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {count} {label}
    </span>
  )
}

export default function ResultsPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const load = () =>
      getJob(jobId)
        .then((data) => {
          if (cancelled) return
          if (!data?.result && data?.status === 'error') {
            setError(data.error || 'Den här omgången misslyckades under bearbetningen.')
            setLoading(false)
            return
          }
          if (!data?.result) {
            if (data?.status === 'processing' || data?.status === 'queued') {
              navigate(`/processing/${jobId}`, { replace: true })
              return
            }
            setError('Inga resultat för den här omgången än. Gå till översikten och öppna den igen när bearbetningen är klar.')
            setLoading(false)
            return
          }
          setResult(data.result)
          setLoading(false)
        })
        .catch((err) => {
          if (cancelled) return
          console.error(err)
          const message = err.message || 'Kunde inte hämta omgången'
          setError(
            /not found|hittades inte|logga in/i.test(message)
              ? 'Den här omgången finns inte på ditt konto. Gå till översikten för att se dina sparade omgångar.'
              : message,
          )
          setLoading(false)
        })

    load()
    return () => {
      cancelled = true
    }
  }, [jobId, navigate])

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
        <EmptyState
          icon={AlertTriangle}
          title="Kunde inte visa omgången"
          description={error}
          action={
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate('/dashboard')}>Till översikten</Button>
              <Button variant="secondary" onClick={() => navigate('/upload')}>
                Ny uppladdning
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
        <Skeleton className="h-10 w-64" />
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full" />
          ))}
        </div>
      </div>
    )
  }

  const garments = result?.garments ?? []
  const counts = garments.reduce((acc, garment) => {
    acc[garment.match_status] = (acc[garment.match_status] ?? 0) + 1
    return acc
  }, {})
  const flaggedForDamage = garments.filter((garment) => garment.defects).length

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">
            {garments.length} {plural(garments.length, 'plagg hittat', 'plagg hittade')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            från {result.total_images} {plural(result.total_images, 'bild', 'bilder')} · {result.total_detections}{' '}
            {plural(result.total_detections, 'detektion', 'detektioner')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate(`/listings/${jobId}`)}>
            <Tag className="h-4 w-4" /> Granska & publicera annonser
          </Button>
          <Button variant="secondary" onClick={() => navigate('/upload')}>
            Ny omgång
          </Button>
        </div>
      </div>

      {garments.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to={`/matching/${jobId}`}
            className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-soft transition hover:bg-brand-50"
          >
            <Link2 className="h-4 w-4" /> Granska matchningar
          </Link>
          <Link
            to={`/groups/${jobId}`}
            className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-soft transition hover:bg-brand-50"
          >
            <Package className="h-4 w-4" /> Föreslagna paket
          </Link>
          <Link
            to={`/listings/${jobId}`}
            className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-soft transition hover:bg-brand-50"
          >
            <Tag className="h-4 w-4" /> Annonser
          </Link>
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
        <SummaryPill label="med hög säkerhet" count={counts.high_confidence ?? 0} tone="good" />
        <SummaryPill label="med medel säkerhet" count={counts.medium_confidence ?? 0} tone="ok" />
        <SummaryPill label="behöver granskas" count={counts.needs_review ?? 0} tone="bad" />
        <SummaryPill label="med möjligt slitage" count={flaggedForDamage} tone="ok" />
      </div>

      {flaggedForDamage > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-5 flex gap-2.5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" strokeWidth={2} />
          <span>
            AI:n har noterat möjligt slitage på {flaggedForDamage} {plural(flaggedForDamage, 'plagg', 'plagg')} – det är
            ett förslag, inte ett omdöme. Kontrollera plagget innan du publicerar.
          </span>
        </motion.div>
      )}

      {result.notes?.length > 0 && (
        <div className="mt-3 space-y-1 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          {result.notes.map((note, index) => (
            <p key={index} className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              {note}
            </p>
          ))}
        </div>
      )}

      {garments.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={PackageX}
            title="Inga plagg hittades"
            description="AI:n kunde inte hitta några plagg i de här bilderna med tillräcklig säkerhet."
            action={<Button onClick={() => navigate('/upload')}>Prova en ny omgång</Button>}
          />
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {garments.map((garment, index) => (
            <GarmentCard key={garment.id} garment={garment} jobId={jobId} index={index} />
          ))}
        </div>
      )}
    </div>
  )
}
