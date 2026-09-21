import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight, CheckCircle2, FolderOpen, Plus, Settings2, Shirt } from 'lucide-react'
import { toast } from 'react-toastify'
import { listJobs } from '../../api'
import { summarizeJobs } from '../../lib/jobsStats'
import { useAuth } from '../../auth/AuthContext'
import Button from '../ui/Button'
import Card from '../ui/Card'
import StatCard from '../ui/StatCard'

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  }),
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState(null)
  const navigate = useNavigate()
  const { profile, loading, session } = useAuth()
  const firstName = profile?.full_name?.split(' ')[0]

  useEffect(() => {
    if (loading) return
    if (!session) {
      setJobs([])
      return
    }
    listJobs()
      .then(setJobs)
      .catch((err) => {
        console.error(err)
        toast.error(err.message || 'Kunde inte hämta dina omgångar')
        setJobs([])
      })
  }, [loading, session])

  const { done, processing, totalGarments } = summarizeJobs(jobs ?? [])

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:py-12">
      <motion.section
        initial="hidden"
        animate="show"
        variants={fadeUp}
        className="relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-ink text-white shadow-elevated"
      >
        <img src="/landing/hero.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-moss/55" />
        <div className="bg-grain pointer-events-none absolute inset-0 opacity-25" />

        <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between lg:p-10">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">Säljarpanel</p>
            <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl lg:text-[2.75rem]">
              Välkommen tillbaka{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/65 sm:text-base">
              Ladda upp en hög med barnkläder. AI:n hittar varje plagg, läser etiketterna och skriver färdiga
              annonser – du granskar och publicerar.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => navigate('/upload')}
            className="!rounded-full !bg-sand !text-ink hover:!bg-white shrink-0"
          >
            <Plus className="h-4 w-4" /> Ny uppladdning
          </Button>
        </div>
      </motion.section>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:mt-8 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Omgångar" value={jobs?.length ?? '—'} icon={FolderOpen} tone="brand" />
        <StatCard label="Plagg" value={jobs ? totalGarments : '—'} icon={Shirt} tone="emerald" />
        <StatCard label="Bearbetas" value={jobs ? processing.length : '—'} icon={Settings2} tone="amber" />
        <StatCard label="Klara" value={jobs ? done.length : '—'} icon={CheckCircle2} tone="emerald" />
      </div>

      <div className="mt-6 lg:mt-8">
        <Card className="flex flex-col justify-between overflow-hidden p-5 sm:p-6 lg:max-w-xl">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">Nästa steg</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">Håll igång försäljningen</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Ladda upp en ny omgång när du har bilder redo. Resultaten dyker upp här så fort bearbetningen är klar.
            </p>
          </div>
          <div className="mt-6 space-y-2">
            <button
              type="button"
              onClick={() => navigate('/upload')}
              className="flex w-full items-center justify-between rounded-2xl border border-moss/15 bg-moss-soft/60 px-4 py-3.5 text-left transition hover:bg-moss-soft"
            >
              <span>
                <span className="block text-sm font-semibold text-ink">Starta en ny uppladdning</span>
                <span className="text-xs text-slate-500">Upp till 40 bilder per omgång</span>
              </span>
              <ArrowUpRight className="h-5 w-5 text-moss" />
            </button>
            <Link
              to="/annonser"
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left transition hover:bg-sand/60"
            >
              <span>
                <span className="block text-sm font-semibold text-ink">Mina annonser & bud</span>
                <span className="text-xs text-slate-500">Publicerade plagg, favoriter och inkomna bud</span>
              </span>
              <ArrowUpRight className="h-5 w-5 text-slate-400" />
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
