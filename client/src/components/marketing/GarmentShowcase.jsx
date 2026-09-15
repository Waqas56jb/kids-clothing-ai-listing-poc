import { motion } from 'framer-motion'
import { Shirt } from 'lucide-react'
import TiltCard from './TiltCard'

const ITEMS = [
  {
    category: 'Floral Dress',
    brand: 'Little Bloom',
    size: '92 · 2Y',
    condition: 'Good',
    conditionTone: 'good',
    confidence: 96,
    range: '55–90',
    recommended: 72,
    from: '#f9a8d4',
    to: '#f472b6',
  },
  {
    category: 'Knit Sweater',
    brand: 'Tiny One',
    size: '104 · 4Y',
    condition: 'Needs review',
    conditionTone: 'review',
    confidence: 88,
    range: '45–80',
    recommended: 58,
    from: '#93c5fd',
    to: '#60a5fa',
  },
  {
    category: 'Padded Jacket',
    brand: 'Nordkid',
    size: '116 · 6Y',
    condition: 'Good',
    conditionTone: 'good',
    confidence: 93,
    range: '80–150',
    recommended: 110,
    from: '#fcd34d',
    to: '#f59e0b',
  },
  {
    category: 'Cotton Romper',
    brand: '—',
    size: '68 · 3M',
    condition: 'Like new',
    conditionTone: 'good',
    confidence: 91,
    range: '35–60',
    recommended: 45,
    from: '#86efac',
    to: '#4ade80',
  },
]

const CONDITION_STYLES = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  review: 'bg-amber-50 text-amber-700 ring-amber-200',
}

function ShowcaseCard({ item, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay: index * 0.1 }}
    >
      <TiltCard maxTilt={7} className="h-full">
        <div className="flex h-full flex-col overflow-hidden rounded-3xl bg-white shadow-elevated ring-1 ring-black/5">
          <div
            className="relative flex aspect-[4/3] items-center justify-center overflow-hidden [transform:translateZ(20px)]"
            style={{ background: `linear-gradient(135deg, ${item.from}, ${item.to})` }}
          >
            <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle,white_1.4px,transparent_1.4px)] [background-size:16px_16px]" />
            <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/25 blur-xl" />
            <Shirt className="h-20 w-20 text-white drop-shadow-lg" strokeWidth={1.25} />
            <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-soft">
              AI matched · 3 photos
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-3 p-5 [transform:translateZ(30px)]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-lg font-semibold text-ink">{item.category}</h3>
                <p className="text-xs text-slate-400">{item.brand} · {item.size}</p>
              </div>
              <span
                className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${CONDITION_STYLES[item.conditionTone]}`}
              >
                {item.condition}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                <span>Detection confidence</span>
                <span className="text-slate-600">{item.confidence}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${item.confidence}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700"
                />
              </div>
            </div>

            <div className="mt-auto flex items-end justify-between border-t border-slate-100 pt-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">AI suggested range</p>
                <p className="text-sm font-semibold text-slate-600">{item.range} SEK</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Recommended</p>
                <p className="font-display text-xl font-bold text-brand-700">{item.recommended} SEK</p>
              </div>
            </div>
          </div>
        </div>
      </TiltCard>
    </motion.div>
  )
}

export default function GarmentShowcase() {
  return (
    <section id="showcase" className="relative mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-2xl text-center"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold">Presentation</p>
        <h2 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl">
          Every garment, presented like it deserves to sell
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-500 sm:text-base">
          Clean crops, matched across photos, priced with a range — this is what your buyers see.
        </p>
      </motion.div>

      <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map((item, index) => (
          <ShowcaseCard key={item.category} item={item} index={index} />
        ))}
      </div>
    </section>
  )
}
