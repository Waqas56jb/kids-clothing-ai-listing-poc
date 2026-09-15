import { motion } from 'framer-motion'
import { CheckCircle2, ScanSearch, ShoppingBag, UploadCloud } from 'lucide-react'

const STEPS = [
  {
    icon: UploadCloud,
    title: 'Upload the pile',
    copy: 'Drop in a batch of photos, however messy — single items, tangled piles, or a full rack. No sorting required.',
  },
  {
    icon: ScanSearch,
    title: 'AI detects & reads',
    copy: 'Every garment is found, cropped, and read: category, brand, size, color, and condition — with a confidence score on each.',
  },
  {
    icon: CheckCircle2,
    title: 'You review, honestly',
    copy: 'Low-confidence calls and possible damage are flagged for a human look — never quietly assumed or hidden.',
  },
  {
    icon: ShoppingBag,
    title: 'Publish with a price',
    copy: 'Accept the AI-suggested price or set your own. Nothing goes live until you approve it.',
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-2xl text-center"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold">How it works</p>
        <h2 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl">
          From a chaotic pile to a live listing
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-500 sm:text-base">
          Four steps, minutes not hours — and a human always has the final word.
        </p>
      </motion.div>

      <div className="relative mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="pointer-events-none absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-brand-200 to-transparent lg:block" />
        {STEPS.map((step, index) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, delay: index * 0.12 }}
            className="relative rounded-3xl border border-white/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm"
          >
            <div className="flex items-center gap-3">
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-elevated">
                <step.icon className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <span className="font-display text-3xl font-semibold text-brand-100/0 text-transparent [-webkit-text-stroke:1.5px_var(--color-brand-200)]">
                {String(index + 1).padStart(2, '0')}
              </span>
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{step.copy}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
