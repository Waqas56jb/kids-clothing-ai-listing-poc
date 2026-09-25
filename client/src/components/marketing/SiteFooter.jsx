import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight, Baby, Globe, Mail, Share2 } from 'lucide-react'
import TiltCard from './TiltCard'
import { LANDING_IMAGES } from './images'
import { BRAND } from '../../lib/sv'

const COLUMNS = [
  {
    title: 'Miniplagg',
    links: [
      { to: '/marknad', label: 'Marknaden' },
      { href: '#how-it-works', label: 'Så funkar det' },
      { href: '#showcase', label: 'Plaggen' },
      { href: '#features', label: 'Funktioner' },
    ],
  },
  {
    title: 'Sälja',
    links: [
      { to: '/login', label: 'Logga in' },
      { to: '/login?mode=signup', label: 'Skapa konto' },
      { to: '/dashboard', label: 'Säljarpanelen' },
    ],
  },
  {
    title: 'Trygghet',
    links: [
      { href: '#features', label: 'Du granskar alltid' },
      { href: '#pipeline', label: 'Ärliga säkerhetsnivåer' },
      { href: '#top', label: 'Dina bilder är privata' },
    ],
  },
]

export default function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-ink/10 bg-ink text-sand">
      <div className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-moss/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-gold/15 blur-3xl" />

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-10 pt-16 sm:px-6 sm:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6 }}
          className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14"
        >
          <div>
            <div className="flex items-center gap-3">
              <TiltCard maxTilt={10} glare={false}>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sand text-ink shadow-elevated">
                  <Baby className="h-5 w-5" />
                </span>
              </TiltCard>
              <div>
                <p className="font-display text-3xl font-semibold tracking-tight text-white">{BRAND}</p>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-white/40">Begagnade barnkläder</p>
              </div>
            </div>
            <p className="mt-6 max-w-md text-base leading-relaxed text-white/60">
              Marknadsplatsen för begagnade barnkläder där AI:n gör grovjobbet – hittar, läser av, prissätter och skriver
              annonsen – och säljaren alltid har sista ordet.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/login?mode=signup"
                className="group inline-flex items-center gap-2 rounded-full bg-sand px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white"
              >
                Börja sälja gratis
                <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <a
                href="mailto:hej@miniplagg.com"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/8 hover:text-white"
              >
                <Mail className="h-4 w-4" />
                hej@miniplagg.com
              </a>
            </div>
          </div>

          <TiltCard maxTilt={5} className="overflow-hidden rounded-[1.75rem]">
            <div className="relative aspect-[16/10] overflow-hidden rounded-[1.75rem] ring-1 ring-white/10">
              <img src={LANDING_IMAGES.nursery} alt="" className="h-full w-full object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">Vår princip</p>
                <p className="mt-1 font-display text-2xl font-semibold text-white">AI:n föreslår. Du bestämmer.</p>
              </div>
            </div>
          </TiltCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.55, delay: 0.08 }}
          className="mt-14 grid gap-8 border-t border-white/10 pt-12 sm:grid-cols-3"
        >
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/40">{column.title}</p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {'to' in link ? (
                      <Link to={link.to} className="text-sm text-white/70 transition hover:text-white">
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} className="text-sm text-white/70 transition hover:text-white">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </motion.div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 py-8 sm:flex-row">
          <p className="text-xs text-white/40">© {new Date().getFullYear()} {BRAND}. Gjord för föräldrar som bryr sig.</p>
          <div className="flex items-center gap-2">
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Instagram"
            >
              <Share2 className="h-4 w-4" />
            </a>
            <a
              href="https://miniplagg.com"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Webbplats"
            >
              <Globe className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
