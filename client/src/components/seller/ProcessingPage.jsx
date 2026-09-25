import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, Sparkles } from 'lucide-react'
import { fileUrl, getJob } from '../../api'
import { garmentImagePath } from '../../lib/garment'
import { categoryLabel, plural } from '../../lib/sv'
import Button from '../ui/Button'

const STEPS = [
  { key: 'detecting', label: 'Hittar plagg i bilderna' },
  { key: 'segmenting_extracting', label: 'Läser av plagg, etiketter och attribut' },
  { key: 'finishing', label: 'Matchar plagg och skriver annonstexter' },
]

function PartialCard({ jobId, garment, index }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-black/5"
    >
      <div className="aspect-square bg-sand">
        <img
          src={fileUrl(jobId, garmentImagePath(garment))}
          alt={categoryLabel(garment.category)}
          className="h-full w-full object-contain p-2"
          loading="lazy"
        />
      </div>
      <div className="p-2.5">
        <p className="truncate text-sm font-semibold text-ink">{categoryLabel(garment.category)}</p>
        <p className="truncate text-xs text-slate-400">
          {[garment.brand, garment.size ? `stl ${garment.size}` : null, garment.color].filter(Boolean).join(' · ') || 'Läser attribut…'}
        </p>
      </div>
    </motion.div>
  )
}

export default function ProcessingPage() {
  const { jobId } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const photoCount = state?.photoCount ?? 1
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)

  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useEffect(() => {
    let cancelled = false
    let timer

    async function poll() {
      try {
        const data = await getJob(jobId)
        if (cancelled) return
        if (data.status === 'done') return navigateRef.current(`/results/${jobId}`, { replace: true })
        if (data.status === 'error') {
          setError(data.error || 'Något gick fel under bearbetningen.')
          return
        }
        setJob(data)
        timer = setTimeout(poll, 1500)
      } catch {
        if (!cancelled) timer = setTimeout(poll, 2500)
      }
    }
    poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [jobId])

  const stageIndex = job?.stage ? STEPS.findIndex((step) => step.key === job.stage) : -1
  const partialGarments = job?.partial?.garments ?? []
  const processed = job?.partial?.processed_detections ?? 0
  const totalDetections = job?.partial?.total_detections ?? 0

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <AlertTriangle className="h-7 w-7" strokeWidth={1.75} />
        </span>
        <h2 className="mt-4 font-display text-2xl font-bold text-slate-800">Bearbetningen misslyckades</h2>
        <p className="mt-2 text-sm text-slate-500">{error}</p>
        <Button className="mt-6" onClick={() => navigate('/upload')}>
          Försök igen
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 py-12 text-center sm:py-16">
      <div className="relative h-20 w-20">
        <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-brand-500"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-brand-500">
          <Sparkles className="h-7 w-7" strokeWidth={1.75} />
        </div>
      </div>
      <h2 className="mt-6 font-display text-2xl font-bold text-slate-800">Analyserar dina bilder…</h2>
      <p className="mt-1 text-sm text-slate-500">
        {photoCount} {plural(photoCount, 'bild', 'bilder')} · plaggen visas här efter hand som de blir klara
      </p>

      <ul className="mt-8 w-full max-w-lg space-y-3 text-left">
        {STEPS.map((step, index) => {
          const done = stageIndex > index
          const active = stageIndex === index
          return (
            <motion.li
              key={step.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08 }}
              className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-soft"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                  done ? 'bg-emerald-500 text-white' : active ? 'animate-pulse-soft bg-brand-500 text-white' : 'bg-slate-100 text-slate-400'
                }`}
              >
                {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : index + 1}
              </span>
              <div className="flex-1">
                <p className={`text-sm font-medium ${done || active ? 'text-slate-800' : 'text-slate-400'}`}>{step.label}</p>
                {active && job?.total > 0 && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <motion.div
                        className="h-full rounded-full bg-brand-400"
                        animate={{ width: `${Math.round((job.current / job.total) * 100)}%` }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>
                    <span className="text-[11px] tabular-nums text-slate-400">
                      {job.current}/{job.total}
                    </span>
                  </div>
                )}
              </div>
            </motion.li>
          )
        })}
      </ul>

      {partialGarments.length > 0 && (
        <div className="mt-10 w-full text-left">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-xl font-semibold text-ink">Plagg hittills</h3>
              <p className="text-sm text-slate-500">
                {partialGarments.length} {plural(partialGarments.length, 'plagg klart', 'plagg klara')}
                {totalDetections ? ` · ${processed} av ${totalDetections} detektioner bearbetade` : ''}
              </p>
            </div>
            <Link to="/dashboard" className="text-sm font-semibold text-brand-700 hover:underline">
              Till översikten
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            <AnimatePresence>
              {partialGarments.map((garment, index) => (
                <PartialCard key={garment.detection_ids?.[0] ?? garment.id} jobId={jobId} garment={garment} index={index} />
              ))}
            </AnimatePresence>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Plaggen matchas mellan bilderna och får annonstexter när alla bilder är klara – du skickas vidare
            automatiskt.
          </p>
        </div>
      )}
    </div>
  )
}
