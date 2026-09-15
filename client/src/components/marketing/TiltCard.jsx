import { useRef } from 'react'
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'framer-motion'

/**
 * Mouse-tracked 3D tilt wrapper with a moving glare highlight -- the
 * "presentation" feel for showcase/feature cards without pulling in a
 * WebGL dependency.
 */
export default function TiltCard({ children, className = '', maxTilt = 10, glare = true }) {
  const ref = useRef(null)
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)

  const rotateX = useSpring(useTransform(py, [0, 1], [maxTilt, -maxTilt]), { stiffness: 260, damping: 20 })
  const rotateY = useSpring(useTransform(px, [0, 1], [-maxTilt, maxTilt]), { stiffness: 260, damping: 20 })
  const glareX = useTransform(px, [0, 1], [0, 100])
  const glareY = useTransform(py, [0, 1], [0, 100])
  const glareBackground = useMotionTemplate`radial-gradient(480px circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.5), transparent 42%)`

  function handleMove(event) {
    const rect = ref.current.getBoundingClientRect()
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
      style={{ rotateX, rotateY, transformPerspective: 1000 }}
      className={`group relative [transform-style:preserve-3d] ${className}`}
    >
      {children}
      {glare && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: glareBackground }}
        />
      )}
    </motion.div>
  )
}
