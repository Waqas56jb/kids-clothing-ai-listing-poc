import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, ChevronRight, FolderOpen, Heart, Plus, Search, Shirt, Store } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import Button from '../ui/Button'
import Card from '../ui/Card'

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  }),
}

const QUICK_ACTIONS = [
  { to: '/upload', label: 'Lägg upp nya plagg', hint: 'Ta bilder så hjälper AI dig', icon: Shirt, tone: 'bg-sky-50 text-sky-600' },
  { to: '/annonser?flik=favoriter', label: 'Mina favoriter', hint: 'Spara dina favoriter', icon: Heart, tone: 'bg-rose-50 text-rose-600' },
  { to: '/marknad', label: 'Se senaste annonserna', hint: 'Upptäck nya fynd', icon: Store, tone: 'bg-emerald-50 text-emerald-600' },
  { to: '/annonser', label: 'Mina uppladdningar', hint: 'Se och hantera', icon: FolderOpen, tone: 'bg-violet-50 text-violet-600' },
]

export default function DashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const firstName = profile?.full_name?.split(' ')[0]

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

      <motion.div custom={1} initial="hidden" animate="show" variants={fadeUp} className="mt-6 lg:mt-8">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-4 p-5 sm:gap-8 sm:p-8">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">Upptäck</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl">Gå till marknaden</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">Hitta unika barnplagg till fantastiska priser.</p>
              <Link
                to="/marknad"
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-moss px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-moss/90"
              >
                <Search className="h-4 w-4" /> Till marknaden <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <img
              src="/landing/hanging.jpg"
              alt=""
              className="h-24 w-24 shrink-0 rounded-2xl object-cover sm:h-40 sm:w-40"
            />
          </div>
        </Card>
      </motion.div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-5 sm:gap-4">
        {QUICK_ACTIONS.map((action, index) => (
          <motion.div key={action.to} custom={index + 2} initial="hidden" animate="show" variants={fadeUp}>
            <Card as={Link} to={action.to} hover className="flex h-full items-start justify-between gap-2 p-4 sm:p-5">
              <div className="min-w-0">
                <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${action.tone}`}>
                  <action.icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <p className="mt-3 text-sm font-semibold text-ink">{action.label}</p>
                <p className="mt-1 text-xs text-slate-500">{action.hint}</p>
              </div>
              <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-300" />
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
