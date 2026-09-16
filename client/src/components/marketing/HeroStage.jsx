import { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { LANDING_IMAGES } from './images'

/** Full-bleed hero visual with subtle 3D mouse parallax (framer-motion only). */
export default function HeroStage() {
  const ref = useRef(null)
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const rotateX = useSpring(useTransform(py, [0, 1], [4, -4]), { stiffness: 120, damping: 24 })
  const rotateY = useSpring(useTransform(px, [0, 1], [-5, 5]), { stiffness: 120, damping: 24 })
  const imgX = useSpring(useTransform(px, [0, 1], [18, -18]), { stiffness: 90, damping: 22 })
  const imgY = useSpring(useTransform(py, [0, 1], [12, -12]), { stiffness: 90, damping: 22 })
  const scale = useSpring(1.08, { stiffness: 80, damping: 20 })

  function handleMove(event) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    px.set((event.clientX - rect.left) / rect.width)
    py.set((event.clientY - rect.top) / rect.height)
  }

  function handleLeave() {
    px.set(0.5)
    py.set(0.5)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ rotateX, rotateY, transformPerspective: 1400 }}
      className="absolute inset-0 -z-10 overflow-hidden [transform-style:preserve-3d]"
    >
      <motion.img
        src={LANDING_IMAGES.hero}
        alt=""
        className="h-full w-full object-cover"
        style={{ x: imgX, y: imgY, scale }}
        initial={{ opacity: 0, scale: 1.14 }}
        animate={{ opacity: 1, scale: 1.08 }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-ink/88 via-ink/55 to-ink/25" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-ink/35" />
      <div className="bg-grain pointer-events-none absolute inset-0 opacity-25" />
    </motion.div>
  )
}
