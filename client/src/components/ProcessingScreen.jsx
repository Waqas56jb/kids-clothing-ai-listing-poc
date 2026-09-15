import { useEffect, useRef, useState } from 'react'
import { getJob } from '../api'

const STEPS = [
  { key: 'detecting', label: 'Detecting garments in your photos' },
  { key: 'segmenting_extracting', label: 'Reading labels & extracting attributes' },
  { key: 'finishing', label: 'Matching items & finishing up' },
]

export default function ProcessingScreen({ jobId, photoCount, onDone, onError }) {
  const [job, setJob] = useState(null)
  const onDoneRef = useRef(onDone)
  const onErrorRef = useRef(onError)
  onDoneRef.current = onDone
  onErrorRef.current = onError

  useEffect(() => {
    let cancelled = false
    let timer

    async function poll() {
      try {
        const data = await getJob(jobId)
        if (cancelled) return
        if (data.status === 'done') return onDoneRef.current(data.result)
        if (data.status === 'error') return onErrorRef.current(data.error || 'Something went wrong while processing.')
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

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-16 text-center">
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
      <h2 className="mt-6 font-display text-2xl font-bold text-slate-800">Analyzing your photos…</h2>
      <p className="mt-1 text-sm text-slate-500">
        {photoCount} photo{photoCount > 1 ? 's' : ''} · this can take a few minutes
      </p>

      <ul className="mt-8 w-full space-y-3 text-left">
        {STEPS.map((step, index) => {
          const done = stageIndex > index
          const active = stageIndex === index
          return (
            <li
              key={step.key}
              className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
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
                    <div
                      className="h-full rounded-full bg-brand-400 transition-all duration-500"
                      style={{ width: `${Math.round((job.current / job.total) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
