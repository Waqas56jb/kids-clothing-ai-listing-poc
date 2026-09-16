import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import {
  Banknote,
  ClipboardCheck,
  Layers,
  ScanEye,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import HowItWorks from './HowItWorks'
import GarmentShowcase from './GarmentShowcase'
import HeroStage from './HeroStage'
import SiteFooter from './SiteFooter'
import SiteHeader from './SiteHeader'
import TiltCard from './TiltCard'
import { LANDING_IMAGES } from './images'

const FEATURES = [
  {
    icon: ScanEye,
    title: 'Detection & segmentation',
    copy: 'Finds and crops every garment from a photo — a single item or a full pile — without manual cutting.',
  },
  {
    icon: Layers,
    title: 'Cross-photo matching',
    copy: 'Recognizes the same physical garment across multiple shots and merges it into one listing entry.',
  },
  {
    icon: Banknote,
    title: 'Pricing recommendations',
    copy: 'Suggests a fair range from category, brand, and condition — always a suggestion, never a final price.',
  },
  {
    icon: ClipboardCheck,
    title: 'Human-in-the-loop review',
    copy: 'Low confidence and possible damage are surfaced honestly, so a person makes the last call every time.',
  },
]

const PIPELINE = [
  { title: 'Detect', detail: 'Locate every wearable region in messy batch photos.' },
  { title: 'Segment', detail: 'Isolate clean crops ready for listing imagery.' },
  { title: 'Attribute', detail: 'Read brand, size, color, and condition signals.' },
  { title: 'Match', detail: 'Link the same item across angles into one SKU.' },
  { title: 'Price', detail: 'Propose a range you can accept, edit, or reject.' },
]

const MARQUEE = [
  'Detection',
  'Segmentation',
  'OCR brands',
  'Size reading',
  'Condition flags',
  'Cross-photo match',
  'Pricing ranges',
  'Seller approval',
]

function Reveal({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-70px' }}
      transition={{ duration: 0.55, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export default function LandingPage() {
  const { scrollYProgress } = useScroll()
  const barWidth = useTransform(scrollYProgress, [0, 1], ['0%', '100%'])

  return (
    <div className="overflow-x-clip bg-surface text-ink">
      <motion.div
        aria-hidden
        className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-gradient-to-r from-moss via-gold to-sand"
        style={{ width: barWidth }}
      />

      <SiteHeader />

      <section id="top" className="relative isolate flex min-h-[100dvh] items-end overflow-hidden pb-16 pt-28 text-white sm:items-center sm:pb-24 sm:pt-32">
        <HeroStage />

        <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-2xl"
          >
            <p className="font-display text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
              Kids AI
            </p>
            <h1 className="mt-5 max-w-xl font-display text-3xl font-medium leading-[1.12] text-white/95 sm:text-4xl lg:text-[2.75rem]">
              Turn a pile of kidswear into a polished listing in minutes.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-white/70 sm:text-lg">
              Upload photos. The studio finds every garment, matches duplicates, reads attributes, and suggests a fair price — you approve every step.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/login?mode=signup"
                className="rounded-full bg-sand px-7 py-3.5 text-sm font-semibold text-ink shadow-elevated transition hover:-translate-y-0.5"
              >
                Get started free
              </Link>
              <a
                href="#how-it-works"
                className="rounded-full border border-white/30 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
              >
                See how it works
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="overflow-hidden border-y border-ink/10 bg-sand py-4">
        <div className="animate-marquee flex w-max gap-10 whitespace-nowrap text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
          {[...MARQUEE, ...MARQUEE].map((item, i) => (
            <span key={`${item}-${i}`} className="flex items-center gap-10">
              {item}
              <span className="text-moss/50">✦</span>
            </span>
          ))}
        </div>
      </div>

      <HowItWorks />
      <GarmentShowcase />

      <section id="pipeline" className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
        <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-moss">The pipeline</p>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-[1.05] text-ink sm:text-5xl">
              A five-stage studio that stays honest
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              Built for secondhand kidswear sellers who need speed without hiding uncertainty. Confidence scores stay visible. Condition is flagged, never assumed.
            </p>
            <ul className="mt-8 space-y-4">
              {PIPELINE.map((item, index) => (
                <li key={item.title} className="flex gap-4 border-b border-ink/8 pb-4">
                  <span className="font-display text-2xl font-semibold text-moss/40">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <p className="font-display text-xl font-semibold text-ink">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.1}>
            <TiltCard maxTilt={7} className="overflow-hidden rounded-[2rem] shadow-elevated">
              <div className="relative aspect-[4/5] sm:aspect-[5/4]">
                <img src={LANDING_IMAGES.soft} alt="" className="h-full w-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">Seller Studio</p>
                  <p className="mt-2 font-display text-3xl font-semibold leading-tight">AI suggests. You decide.</p>
                </div>
              </div>
            </TiltCard>
          </Reveal>
        </div>
      </section>

      <section id="features" className="bg-white/50 py-24 sm:py-32">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-moss">Built for sellers</p>
            <h2 className="mt-4 font-display text-4xl font-semibold text-ink sm:text-5xl">
              Everything the pipeline handles for you
            </h2>
          </Reveal>

          <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature, index) => (
              <Reveal key={feature.title} delay={index * 0.06}>
                <TiltCard maxTilt={6} className="h-full">
                  <div className="flex h-full flex-col rounded-[1.5rem] border border-ink/8 bg-white p-6 shadow-soft">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-sand">
                      <feature.icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <h3 className="mt-5 font-display text-xl font-semibold text-ink">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.copy}</p>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="grid overflow-hidden rounded-[2rem] bg-moss text-sand lg:grid-cols-[1.1fr_0.9fr]">
            <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-14">
              <ShieldCheck className="h-8 w-8 text-sand/80" strokeWidth={1.5} />
              <h2 className="mt-5 font-display text-3xl font-semibold leading-tight sm:text-4xl">
                Your batches stay on your account
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-sand/80">
                Interpretation results save to your private workspace. New sellers start at zero. Admin can review across accounts — sellers only ever see their own.
              </p>
              <div className="mt-8 flex flex-wrap gap-6 text-sm font-medium text-sand/70">
                <span>AWS Postgres</span>
                <span>S3 media</span>
                <span>Per-seller isolation</span>
              </div>
            </div>
            <div className="min-h-64">
              <img src={LANDING_IMAGES.rack} alt="" className="h-full w-full object-cover" loading="lazy" />
            </div>
          </div>
        </Reveal>
      </section>

      <section className="px-4 pb-8 sm:px-6">
        <Reveal>
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-ink px-6 py-16 text-center text-white sm:px-16 sm:py-20">
            <div className="bg-grain pointer-events-none absolute inset-0 opacity-25" />
            <Sparkles className="relative mx-auto h-7 w-7 text-gold" strokeWidth={1.5} />
            <h2 className="relative mx-auto mt-5 max-w-2xl font-display text-3xl font-semibold leading-tight sm:text-5xl">
              “AI suggests. The seller always decides.”
            </h2>
            <p className="relative mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/65">
              Every category, price, and condition call is a suggestion you can accept, edit, or reject — never an automatic final answer.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-24 text-center sm:px-6 sm:py-28">
        <Reveal>
          <h2 className="font-display text-4xl font-semibold text-ink sm:text-5xl">Ready to list your next batch?</h2>
          <p className="mx-auto mt-4 max-w-md text-base text-slate-600">
            Create a free seller account and upload your first pile in under a minute.
          </p>
          <Link
            to="/login?mode=signup"
            className="mt-9 inline-flex rounded-full bg-ink px-9 py-4 text-sm font-semibold text-sand shadow-elevated transition hover:-translate-y-0.5 hover:bg-moss"
          >
            Get started free
          </Link>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  )
}
