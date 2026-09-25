import { motion } from 'framer-motion'
import { CheckCircle2, ScanSearch, ShoppingBag, UploadCloud } from 'lucide-react'
import { LANDING_IMAGES } from './images'

const STEPS = [
  {
    icon: UploadCloud,
    title: 'Ladda upp högen',
    copy: 'Släpp in 20–30 bilder åt gången – enstaka plagg, en hög eller en hel klädstång. Ingen sortering behövs innan du börjar.',
    image: LANDING_IMAGES.rack,
  },
  {
    icon: ScanSearch,
    title: 'AI:n hittar och läser av',
    copy: 'Varje plagg hittas och läses av: kategori, märke, storlek, färg och skick – med en säkerhetsnivå på varje uppgift. Plaggen dyker upp efter hand som de blir klara.',
    image: LANDING_IMAGES.flatlay,
  },
  {
    icon: CheckCircle2,
    title: 'Du granskar – ärligt',
    copy: 'Osäkra bedömningar och möjligt slitage flaggas för en mänsklig titt – aldrig tyst antaget eller dolt. Annonsbilderna är alltid dina egna foton – AI:n ändrar dem aldrig.',
    image: LANDING_IMAGES.soft,
  },
  {
    icon: ShoppingBag,
    title: 'Publicera med pris',
    copy: 'Färdig svensk titel, beskrivning och prisförslag. Godkänn eller ändra – inget går live förrän du trycker på Publicera.',
    image: LANDING_IMAGES.hanging,
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6 }}
        className="max-w-2xl"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-moss">Så funkar det</p>
        <h2 className="mt-4 font-display text-4xl font-semibold leading-[1.05] text-ink sm:text-5xl">
          Från en rörig hög till färdiga annonser
        </h2>
        <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
          Fyra tydliga steg. Minuter, inte timmar – och en människa har alltid sista ordet.
        </p>
      </motion.div>

      <div className="mt-16 space-y-8 lg:space-y-12">
        {STEPS.map((step, index) => {
          const reverse = index % 2 === 1
          return (
            <motion.article
              key={step.title}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.55, delay: 0.05 }}
              className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-14 ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}
            >
              <div className="overflow-hidden rounded-[1.75rem] bg-sand shadow-elevated">
                <img
                  src={step.image}
                  alt=""
                  className="aspect-[5/4] w-full object-cover transition duration-700 hover:scale-[1.03]"
                  loading="lazy"
                />
              </div>
              <div className="px-1">
                <span className="font-display text-5xl font-semibold text-moss-soft sm:text-6xl">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="mt-4 flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-sand">
                    <step.icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <h3 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{step.title}</h3>
                </div>
                <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600">{step.copy}</p>
              </div>
            </motion.article>
          )
        })}
      </div>
    </section>
  )
}
