import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import { Banknote, ClipboardCheck, Layers, ScanEye, ShieldCheck, Sparkles, Store } from 'lucide-react'
import HowItWorks from './HowItWorks'
import GarmentShowcase from './GarmentShowcase'
import HeroStage from './HeroStage'
import SiteFooter from './SiteFooter'
import SiteHeader from './SiteHeader'
import TiltCard from './TiltCard'
import { LANDING_IMAGES } from './images'
import { BRAND } from '../../lib/sv'

const FEATURES = [
  {
    icon: ScanEye,
    title: 'Hittar och friläger',
    copy: 'Hittar och beskär varje plagg i en bild – ett enstaka plagg eller en hel hög – utan manuell klippning. Blir frilägningen inte ren används ditt originalfoto.',
  },
  {
    icon: Layers,
    title: 'Matchar mellan bilder',
    copy: 'Känner igen samma fysiska plagg i flera bilder och slår ihop dem till en enda annons.',
  },
  {
    icon: Banknote,
    title: 'Prisförslag i kronor',
    copy: 'Föreslår ett rimligt prisintervall utifrån kategori, märke och skick – alltid ett förslag, aldrig ett slutpris utan ditt okej.',
  },
  {
    icon: ClipboardCheck,
    title: 'Du har sista ordet',
    copy: 'Låg säkerhet och möjligt slitage lyfts fram ärligt, så att en människa alltid tar det sista beslutet.',
  },
]

const PIPELINE = [
  { title: 'Hitta', detail: 'Lokaliserar varje plagg i röriga bilder – 20–30 åt gången.' },
  { title: 'Frilägg', detail: 'Rena bilder redo för annonsen, utan att förvränga eller kapa plagget.' },
  { title: 'Läs av', detail: 'Märke, storlek, färg och skick – på svenska.' },
  { title: 'Matcha', detail: 'Länkar samma plagg från olika vinklar till en annons.' },
  { title: 'Skriv & prissätt', detail: 'Färdig svensk titel, beskrivning och prisförslag att godkänna eller ändra.' },
]

const MARQUEE = [
  'Hittar plagg',
  'Friläggning',
  'Läser etiketter',
  'Storlekar',
  'Skick flaggas',
  'Matchning',
  'Prisförslag',
  'Svenska annonser',
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
            <p className="font-display text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">{BRAND}</p>
            <h1 className="mt-5 max-w-xl font-display text-3xl font-medium leading-[1.12] text-white/95 sm:text-4xl lg:text-[2.75rem]">
              Begagnade barnkläder – från en hög på golvet till färdiga annonser på minuter.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-white/70 sm:text-lg">
              Ladda upp bilderna. AI:n hittar varje plagg, matchar dubbletter, läser av etiketterna, skriver annonsen på
              svenska och föreslår ett pris – du godkänner varje steg.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/marknad"
                className="inline-flex items-center gap-2 rounded-full bg-sand px-7 py-3.5 text-sm font-semibold text-ink shadow-elevated transition hover:-translate-y-0.5"
              >
                <Store className="h-4 w-4" /> Utforska marknaden
              </Link>
              <Link
                to="/login?mode=signup"
                className="rounded-full border border-white/30 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
              >
                Börja sälja gratis
              </Link>
            </div>
            <p className="mt-4 text-xs text-white/50">Titta fritt utan konto – skapa konto först när du vill köpa, lägga bud eller sälja.</p>
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-moss">Bakom kulisserna</p>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-[1.05] text-ink sm:text-5xl">
              Fem steg som håller sig ärliga
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              Byggt för föräldrar som vill sälja snabbt utan att dölja osäkerhet. Säkerhetsnivåerna syns alltid. Skick
              flaggas – antas aldrig.
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
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">{BRAND}</p>
                  <p className="mt-2 font-display text-3xl font-semibold leading-tight">AI:n föreslår. Du bestämmer.</p>
                </div>
              </div>
            </TiltCard>
          </Reveal>
        </div>
      </section>

      <section id="features" className="bg-white/50 py-24 sm:py-32">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-moss">Byggt för säljare</p>
            <h2 className="mt-4 font-display text-4xl font-semibold text-ink sm:text-5xl">Allt AI:n gör åt dig</h2>
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
                Dina bilder och plagg stannar på ditt konto
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-sand/80">
                Bara det du väljer att publicera syns på marknaden. Originalfotona sparas alltid och AI:n får aldrig göra
                dina bilder sämre.
              </p>
              <div className="mt-8 flex flex-wrap gap-6 text-sm font-medium text-sand/70">
                <span>Privata omgångar</span>
                <span>Originalfoton bevaras</span>
                <span>Publicera när du vill</span>
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
              ”AI:n föreslår. Säljaren bestämmer alltid.”
            </h2>
            <p className="relative mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/65">
              Varje kategori, pris och skickbedömning är ett förslag du kan godkänna, ändra eller avvisa – aldrig ett
              automatiskt slutgiltigt svar.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-24 text-center sm:px-6 sm:py-28">
        <Reveal>
          <h2 className="font-display text-4xl font-semibold text-ink sm:text-5xl">Redo att tömma garderoben?</h2>
          <p className="mx-auto mt-4 max-w-md text-base text-slate-600">
            Skapa ett gratis konto och ladda upp din första hög på under en minut.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              to="/login?mode=signup"
              className="inline-flex rounded-full bg-ink px-9 py-4 text-sm font-semibold text-sand shadow-elevated transition hover:-translate-y-0.5 hover:bg-moss"
            >
              Börja sälja gratis
            </Link>
            <Link
              to="/marknad"
              className="inline-flex rounded-full border border-ink/15 bg-white px-9 py-4 text-sm font-semibold text-ink shadow-soft transition hover:-translate-y-0.5"
            >
              Se vad som säljs
            </Link>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  )
}
