import { Loader2 } from 'lucide-react'

export default function Loader({ label = 'Laddar…', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-16 ${className}`}>
      <span className="relative flex h-12 w-12 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-brand-100" />
        <Loader2 className="h-6 w-6 animate-spin text-brand-700" />
      </span>
      <p className="text-sm font-medium tracking-wide text-slate-500">{label}</p>
    </div>
  )
}
