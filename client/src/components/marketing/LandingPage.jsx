import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Baby,
  Banknote,
  ClipboardCheck,
  Layers,
  Menu,
  ScanEye,
  Sparkles,
  Tag,
  X,
} from 'lucide-react'
import HowItWorks from './HowItWorks'
import GarmentShowcase from './GarmentShowcase'
import TiltCard from './TiltCard'

const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#showcase', label: 'Showcase' },
  { href: '#features', label: 'Features' },
]

const FEATURES = [
  {
    icon: ScanEye,
    title: 'Detection & segmentation',
    copy: 'Finds and crops every garment from a photo — a single item or a full pile — no manual cutting required.',
  },
  {
    icon: Layers,
    title: 'Cross-photo matching',
    copy: 'Recognizes the same physical garment across multiple shots and merges it into one listing entry.',
  },
  {
    icon: Banknote,
    title: 'Pricing recommendations',
    copy: 'Suggests a fair range and price from category, brand, and condition — always shown as a suggestion, never final.',
  },
  {
    icon: ClipboardCheck,
    title: 'Human-in-the-loop review',
    copy: 'Low confidence and possible damage are surfaced honestly, so a person makes the last call every time.',
  },
]

function FloatingCard({ className, delay = 0, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, delay }}
      className={`animate-float absolute rounded-2xl border border-white/15 bg-white/10 p-3 shadow-elevated backdrop-blur-md ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </motion.div>
  )
}

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="overflow-x-clip">
      {/* Nav */}
      <header className="sticky top-0 z-40 safe-top">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 rounded-full bg-ink/80 py-1.5 pl-2 pr-2 text-white shadow-elevated backdrop-blur-xl sm:pr-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
              <Baby className="h-4 w-4" />
            </span>
            <span className="hidden font-display text-sm font-semibold sm:block">Kids AI Listing</span>
          </div>

          <nav className="hidden items-center gap-1 rounded-full bg-ink/80 px-2 py-1.5 text-sm font-medium text-brand-100 shadow-elevated backdrop-blur-xl md:flex">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="rounded-full px-3.5 py-1.5 transition hover:bg-white/10 hover:text-white">
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Link
              to="/login"
              className="rounded-full px-4 py-2 text-sm font-semibold text-ink transition hover:text-brand-700"
            >
              Sign in
            </Link>
            <Link
              to="/login?mode=signup"
              className="rounded-full bg-gradient-to-r from-brand-600 to-brand-800 px-4 py-2 text-sm font-semibold text-white shadow-elevated transition hover:brightness-110"
            >
              Get started free
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/80 text-white shadow-elevated backdrop-blur-xl md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-4 mt-1 flex flex-col gap-1 rounded-2xl bg-ink/95 p-3 text-sm font-medium text-brand-100 shadow-elevated backdrop-blur-xl md:hidden"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-xl px-3 py-2.5 hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-1 flex gap-2 border-t border-white/10 pt-3">
              <Link to="/login" className="flex-1 rounded-xl bg-white/10 px-3 py-2.5 text-center text-white">
                Sign in
              </Link>
              <Link
                to="/login?mode=signup"
                className="flex-1 rounded-xl bg-gradient-to-r from-brand-600 to-brand-800 px-3 py-2.5 text-center font-semibold text-white"
              >
                Get started
              </Link>
            </div>
          </motion.div>
        )}
      </header>

      {/* Hero */}
      <section className="relative isolate mt-[-64px] overflow-hidden pb-24 pt-32 text-white sm:pb-32 sm:pt-40">
        <div className="mesh-hero absolute inset-0 -z-20" />
        <div className="bg-grain pointer-events-none absolute inset-0 -z-10 opacity-30" />
        <div className="pointer-events-none absolute -left-24 top-10 -z-10 h-72 w-72 bg-brand-400/30 blur-3xl animate-blob" />
        <div className="pointer-events-none absolute -right-16 top-40 -z-10 h-80 w-80 bg-gold/20 blur-3xl animate-blob-slow" />

        <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-16 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-100 backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              AI suggests. Seller decides.
            </span>

            <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-[3.4rem]">
              Turn a pile of kidswear into a <span className="text-gradient">polished listing</span> in minutes.
            </h1>

            <p className="mt-6 max-w-lg text-base leading-relaxed text-brand-100 sm:text-lg">
              Upload a batch of photos. The AI finds every garment, matches duplicates across shots, reads brand and
              size, flags condition honestly, and suggests a fair price — you approve every step before it ever
              goes live.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/login?mode=signup"
                className="rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-brand-800 shadow-elevated transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                Get started free
              </Link>
              <a
                href="#how-it-works"
                className="rounded-2xl border border-white/25 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
              >
                See how it works
              </a>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-xs font-medium text-brand-200">
              <span>4-stage AI pipeline</span>
              <span className="opacity-40">·</span>
              <span>Cross-photo matching</span>
              <span className="opacity-40">·</span>
              <span>Condition flagged, never assumed</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative mx-auto hidden h-[26rem] w-full max-w-md [transform-style:preserve-3d] sm:block"
          >
            <TiltCard maxTilt={6} className="absolute left-1/2 top-1/2 w-72 -translate-x-1/2 -translate-y-1/2">
              <div className="rounded-3xl border border-white/15 bg-white/95 p-5 text-ink shadow-elevated">
                <div className="flex items-center justify-between">
                  <p className="font-display text-base font-semibold">Floral Dress</p>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    Good
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">Little Bloom · 92 · 2Y</p>
                <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">AI recommended</p>
                    <p className="font-display text-2xl font-bold text-brand-700">72 SEK</p>
                  </div>
                  <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                    96% match
                  </span>
                </div>
              </div>
            </TiltCard>

            <FloatingCard className="left-0 top-2 w-40 text-white" delay={0.2}>
              <p className="text-[11px] font-semibold text-brand-100">Detecting…</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                <div className="h-full w-4/5 rounded-full bg-gradient-to-r from-brand-300 to-gold" />
              </div>
            </FloatingCard>

            <FloatingCard className="bottom-6 right-0 w-44 text-white" delay={0.6}>
              <p className="text-[11px] font-semibold text-brand-100">Needs review</p>
              <p className="mt-1 text-xs text-brand-200">Possible mark on sleeve — please verify.</p>
            </FloatingCard>

            <FloatingCard className="bottom-2 left-2 w-32 text-white" delay={1.1}>
              <p className="text-[11px] font-semibold text-brand-100">3 photos</p>
              <p className="text-xs text-brand-200">matched as one item</p>
            </FloatingCard>
          </motion.div>
        </div>
      </section>

      <HowItWorks />
      <GarmentShowcase />

      {/* Features */}
      <section id="features" className="bg-white/60 py-20 sm:py-28">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-2xl text-center"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold">Built for sellers</p>
            <h2 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl">
              Everything the pipeline handles for you
            </h2>
          </motion.div>

          <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -6 }}
                className="rounded-3xl border border-slate-100 bg-white p-6 shadow-soft transition-shadow hover:shadow-elevated"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-soft">
                  <feature.icon className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold text-ink">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{feature.copy}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-800 via-brand-900 to-ink px-6 py-16 text-center text-white sm:px-16 sm:py-20"
        >
          <div className="bg-grain pointer-events-none absolute inset-0 opacity-30" />
          <div className="pointer-events-none absolute -left-10 -top-10 h-56 w-56 rounded-full bg-brand-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative">
            <Tag className="mx-auto h-8 w-8 text-gold" strokeWidth={1.5} />
            <h2 className="mx-auto mt-5 max-w-2xl font-display text-3xl font-semibold leading-tight sm:text-4xl">
              "AI suggests. The seller always decides."
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-brand-100 sm:text-base">
              Every category, price, and condition call the AI makes is a suggestion you can accept, edit, or
              reject — never an automatic, final answer.
            </p>
          </div>
        </motion.div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto w-full max-w-4xl px-4 pb-24 text-center sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Ready to list your next batch?</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-slate-500 sm:text-base">
            Create a free seller account and upload your first batch in under a minute.
          </p>
          <Link
            to="/login?mode=signup"
            className="mt-8 inline-flex rounded-2xl bg-gradient-to-r from-brand-600 to-brand-800 px-8 py-4 text-sm font-semibold text-white shadow-elevated transition hover:-translate-y-0.5 hover:shadow-xl"
          >
            Get started free
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200/70 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-800 text-white">
              <Baby className="h-4 w-4" />
            </span>
            <div>
              <p className="font-display text-sm font-semibold text-ink">Kids AI Listing</p>
              <p className="text-xs text-slate-400">AI Suggests, Seller Decides.</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} Kids AI Listing. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
