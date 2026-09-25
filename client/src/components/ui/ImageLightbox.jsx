import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

const SWIPE_DISTANCE = 60
const SWIPE_VELOCITY = 400

const slide = {
  enter: (direction) => ({ x: direction > 0 ? '60%' : direction < 0 ? '-60%' : 0, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction) => ({ x: direction > 0 ? '-60%' : direction < 0 ? '60%' : 0, opacity: 0 }),
}

/**
 * Fullscreen photo viewer: swipe (or arrow keys / buttons) through `images`,
 * close with ✕, Escape, a tap on the backdrop, or the phone's back button --
 * which on mobile would otherwise leave the listing altogether.
 */
export default function ImageLightbox({ images, index, onIndexChange, open, onClose, alt = '' }) {
  const [direction, setDirection] = useState(0)
  const pushedHistory = useRef(false)
  const count = images.length

  const go = useCallback(
    (step) => {
      if (count < 2) return
      setDirection(step)
      onIndexChange((index + step + count) % count)
    },
    [count, index, onIndexChange],
  )

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const close = useCallback(() => {
    if (pushedHistory.current) {
      pushedHistory.current = false
      window.history.back() // the popstate listener finishes closing
    } else {
      onCloseRef.current()
    }
  }, [])

  // Only on open/close -- never per swipe, or "back" would step through
  // photos instead of closing the viewer.
  useEffect(() => {
    if (!open) return undefined
    // An extra history entry (keeping the router's own state) so "back"
    // closes the viewer instead of navigating away from the listing.
    window.history.pushState({ ...(window.history.state || {}), lightbox: true }, '')
    pushedHistory.current = true
    const onPop = () => {
      pushedHistory.current = false
      onCloseRef.current()
    }
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    window.addEventListener('popstate', onPop)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('popstate', onPop)
      // Closed from outside or unmounted while open: drop our entry too.
      if (pushedHistory.current) {
        pushedHistory.current = false
        window.history.back()
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') close()
      else if (event.key === 'ArrowRight') go(1)
      else if (event.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, go])

  // Warm the neighbours so a swipe never shows a blank frame.
  useEffect(() => {
    if (!open || count < 2) return
    for (const step of [1, -1]) {
      const img = new Image()
      img.src = images[(index + step + count) % count]
    }
  }, [open, index, images, count])

  return createPortal(
    <AnimatePresence>
      {open && count > 0 && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Bildvisning"
          className="fixed inset-0 z-[70] flex flex-col bg-black text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="safe-top flex items-center justify-between px-3 py-3 sm:px-5">
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm tabular-nums" aria-live="polite">
              {index + 1} / {count}
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Stäng"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden" onClick={close}>
            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              <motion.img
                key={images[index]}
                src={images[index]}
                alt={alt}
                custom={direction}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ x: { type: 'spring', stiffness: 320, damping: 34 }, opacity: { duration: 0.15 } }}
                drag={count > 1 ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.7}
                onDragEnd={(_event, { offset, velocity }) => {
                  if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) go(1)
                  else if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) go(-1)
                }}
                onClick={(event) => event.stopPropagation()}
                draggable={false}
                className="max-h-full max-w-full touch-pan-y select-none object-contain px-2 sm:px-16"
              />
            </AnimatePresence>

            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    go(-1)
                  }}
                  aria-label="Föregående bild"
                  className="absolute left-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/25 sm:flex"
                >
                  <ChevronLeft className="h-7 w-7" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    go(1)
                  }}
                  aria-label="Nästa bild"
                  className="absolute right-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/25 sm:flex"
                >
                  <ChevronRight className="h-7 w-7" />
                </button>
              </>
            )}
          </div>

          {count > 1 && (
            <div className="safe-bottom flex justify-center gap-2 overflow-x-auto px-3 py-3">
              {images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => {
                    setDirection(i > index ? 1 : -1)
                    onIndexChange(i)
                  }}
                  aria-label={`Visa bild ${i + 1}`}
                  aria-current={i === index ? 'true' : undefined}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/5 ring-2 transition ${
                    i === index ? 'ring-white' : 'opacity-60 ring-transparent hover:opacity-100'
                  }`}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
