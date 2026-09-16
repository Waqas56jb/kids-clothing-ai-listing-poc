import { motion } from 'framer-motion'
import TiltCard from './TiltCard'
import { LANDING_IMAGES } from './images'

const ITEMS = [
  {
    category: 'Stickat set',
    brand: 'Little Atelier',
    size: 'stl 92',
    condition: 'Som ny',
    confidence: 96,
    range: '55–90',
    recommended: 72,
    image: LANDING_IMAGES.knit,
  },
  {
    category: 'Jumpsuit',
    brand: 'Tiny One',
    size: 'stl 80',
    condition: 'Bra skick',
    confidence: 91,
    range: '35–60',
    recommended: 45,
    image: LANDING_IMAGES.toddler,
  },
  {
    category: 'Regnjacka',
    brand: 'Nordkid',
    size: 'stl 116',
    condition: 'Behöver granskas',
    confidence: 88,
    range: '80–150',
    recommended: 110,
    image: LANDING_IMAGES.hanging,
  },
  {
    category: 'Lekklänning',
    brand: 'Bloom Co.',
    size: 'stl 104',
    condition: 'Bra skick',
    confidence: 94,
    range: '50–85',
    recommended: 68,
    image: LANDING_IMAGES.clothes,
  },
]

export default function GarmentShowcase() {
  return (
    <section id="showcase" className="relative overflow-hidden bg-ink py-24 text-sand sm:py-32">
      <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-moss/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-gold/20 blur-3xl" />

      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold">Plaggen</p>
          <h2 className="mt-4 font-display text-4xl font-semibold leading-[1.05] text-white sm:text-5xl">
            Varje plagg presenterat så att det säljer
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/65">
            Rena bilder, matchade mellan foton och prissatta med ett intervall – luta korten för att känna djupet.
          </p>
        </motion.div>

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((item, index) => (
            <motion.div
              key={item.category}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.55, delay: index * 0.08 }}
            >
              <TiltCard maxTilt={9} className="h-full">
                <div className="flex h-full flex-col overflow-hidden rounded-[1.5rem] bg-white text-ink shadow-elevated">
                  <div className="relative aspect-[4/5] overflow-hidden [transform:translateZ(24px)]">
                    <img src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent" />
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-5 [transform:translateZ(36px)]">
                    <div>
                      <h3 className="font-display text-xl font-semibold">{item.category}</h3>
                      <p className="text-xs text-slate-500">
                        {item.brand} · {item.size}
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                      <span>{item.condition}</span>
                      <span>{item.confidence} % säkerhet</span>
                    </div>
                    <div className="mt-auto flex items-end justify-between border-t border-slate-100 pt-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Intervall</p>
                        <p className="text-sm font-semibold text-slate-700">{item.range} kr</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Förslag</p>
                        <p className="font-display text-2xl font-semibold text-moss">{item.recommended} kr</p>
                      </div>
                    </div>
                  </div>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
