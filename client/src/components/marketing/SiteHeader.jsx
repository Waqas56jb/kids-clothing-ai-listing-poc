import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion'
import { ArrowUpRight, Baby, Menu, X } from 'lucide-react'
import TiltCard from './TiltCard'

const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#showcase', label: 'Showcase' },
  { href: '#pipeline', label: 'Pipeline' },
  { href: '#features', label: 'Features' },
]

export default function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { scrollY } = useScroll()

  useMotionValueEvent(scrollY, 'change', (value) => {
    setScrolled(value > 24)
  })

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  return (
    <>
      <motion.header
        className="fixed inset-x-0 top-0 z-40 safe-top"
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          layout
          className={`mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 transition-all duration-500 sm:px-6 ${
            scrolled ? 'py-2.5' : 'py-4'
          }`}
        >
          <motion.div
            layout
            className={`flex w-full items-center justify-between gap-3 rounded-[1.75rem] border px-2.5 py-2 shadow-elevated backdrop-blur-2xl transition-colors duration-500 ${
              scrolled
                ? 'border-white/10 bg-ink/90 text-white'
                : 'border-white/15 bg-ink/55 text-white'
            }`}
          >
            <a href="#top" className="flex items-center gap-2.5 pl-1" onClick={() => setMobileOpen(false)}>
              <TiltCard maxTilt={12} glare={false} className="shrink-0">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sand/25 to-white/5 ring-1 ring-white/20">
                  <Baby className="h-4.5 w-4.5 text-sand" />
                </span>
              </TiltCard>
              <span className="min-w-0">
                <span className="block font-display text-xl font-semibold leading-none tracking-tight">Kids AI</span>
                <span className="mt-0.5 hidden text-[10px] font-medium uppercase tracking-[0.22em] text-white/45 sm:block">
                  Seller Studio
                </span>
              </span>
            </a>

            <nav className="hidden items-center gap-0.5 md:flex">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="group relative rounded-full px-3.5 py-2 text-[13px] font-medium text-white/70 transition hover:text-white"
                >
                  {link.label}
                  <span className="absolute inset-x-3 -bottom-0.5 h-px origin-left scale-x-0 bg-gradient-to-r from-gold to-sand transition duration-300 group-hover:scale-x-100" />
                </a>
              ))}
            </nav>

            <div className="hidden items-center gap-2 pr-1 md:flex">
              <Link
                to="/login"
                className="rounded-full px-4 py-2 text-[13px] font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
              >
                Sign in
              </Link>
              <Link
                to="/login?mode=signup"
                className="group inline-flex items-center gap-1.5 rounded-full bg-sand px-4 py-2.5 text-[13px] font-semibold text-ink transition hover:bg-white"
              >
                Get started
                <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="mr-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white md:hidden"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </motion.div>
        </motion.div>
      </motion.header>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
          >
            <motion.div
              initial={{ y: -24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -16, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="mx-4 mt-24 overflow-hidden rounded-[1.75rem] border border-white/10 bg-ink/95 p-3 shadow-elevated backdrop-blur-2xl"
            >
              {NAV_LINKS.map((link, index) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * index }}
                  className="block rounded-2xl px-4 py-3.5 text-sm font-medium text-white/80 hover:bg-white/8 hover:text-white"
                >
                  {link.label}
                </motion.a>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-2xl bg-white/10 px-3 py-3 text-center text-sm font-semibold text-white"
                >
                  Sign in
                </Link>
                <Link
                  to="/login?mode=signup"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-2xl bg-sand px-3 py-3 text-center text-sm font-semibold text-ink"
                >
                  Get started
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
