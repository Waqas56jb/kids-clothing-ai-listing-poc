import { motion } from 'framer-motion'

const VARIANTS = {
  primary: 'bg-brand-700 text-white shadow-soft hover:bg-brand-800 focus-visible:ring-brand-300',
  secondary: 'bg-white/90 text-ink border border-slate-200 hover:bg-sand focus-visible:ring-slate-200',
  ghost: 'text-brand-700 hover:bg-brand-50 focus-visible:ring-brand-200',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-300',
}

const SIZES = {
  sm: 'px-3 py-2 text-xs min-h-10',
  md: 'px-4 py-2.5 text-sm min-h-11',
  lg: 'px-6 py-3.5 text-base min-h-12',
}

export default function Button({ variant = 'primary', size = 'md', className = '', children, ...props }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`inline-flex touch-manipulation items-center justify-center gap-2 rounded-2xl font-semibold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  )
}
