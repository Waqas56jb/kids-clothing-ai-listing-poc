import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { getJob } from '../../api'

const STEPS = [
  { key: 'detecting', label: 'Detecting garments in your photos' },
  { key: 'segmenting_extracting', label: 'Reading labels & extracting attributes' },
  { key: 'finishing', label: 'Matching items & finishing up' },
]

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
          setError(data.error || 'Something went wrong while processing.')
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

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-16 text-center">
        <span className="text-4xl">⚠️</span>
        <h2 className="mt-4 font-display text-2xl font-bold text-slate-800">Processing failed</h2>
        <p className="mt-2 text-sm text-slate-500">{error}</p>
        <button
          onClick={() => navigate('/upload')}
          className="mt-6 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft hover:bg-brand-700"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-16 text-center">
      <div className="relative h-20 w-20">
        <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-brand-500"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-2xl">🤖</div>
      </div>
      <h2 className="mt-6 font-display text-2xl font-bold text-slate-800">Analyzing your photos…</h2>
      <p className="mt-1 text-sm text-slate-500">
        {photoCount} photo{photoCount > 1 ? 's' : ''} · this can take a few minutes
      </p>

      <ul className="mt-8 w-full space-y-3 text-left">
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
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                      ? 'animate-pulse-soft bg-brand-500 text-white'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {done ? '✓' : index + 1}
              </span>
              <div className="flex-1">
                <p className={`text-sm font-medium ${done || active ? 'text-slate-800' : 'text-slate-400'}`}>
                  {step.label}
                </p>
                {active && job?.total > 0 && (
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      className="h-full rounded-full bg-brand-400"
                      animate={{ width: `${Math.round((job.current / job.total) * 100)}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                )}
              </div>
            </motion.li>
          )
        })}
      </ul>
    </div>
  )
}
