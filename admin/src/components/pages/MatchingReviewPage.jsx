import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Check, Link2, X } from 'lucide-react'
import { toast } from 'react-toastify'
import { fileUrl, getJob, patchWorkspace } from '../../api'
import { detectionImagePath, toneForMatch } from '../../lib/garment'
import { categoryLabel } from '../../lib/sv'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

function MatchCard({ garment, jobId, decision, onDecide }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white p-5 shadow-soft"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-base font-bold text-slate-800">{categoryLabel(garment.category)}</h3>
          <Badge tone={toneForMatch(garment.match_status)}>
            {Math.round(garment.match_confidence * 100)} % matchning
          </Badge>
        </div>
        {decision ? (
          <Badge tone={decision === 'confirmed' ? 'good' : 'bad'}>
            {decision === 'confirmed' ? 'Bekräftat: samma plagg' : 'Markerat som olika plagg'}
          </Badge>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => onDecide(garment.id, 'rejected')}>
              <X className="h-3.5 w-3.5" /> Olika plagg
            </Button>
            <Button size="sm" onClick={() => onDecide(garment.id, 'confirmed')}>
              <Check className="h-3.5 w-3.5" /> Samma plagg
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {garment.detection_ids.map((id, i) => (
          <div key={id} className="w-24">
            <div className="aspect-square overflow-hidden rounded-xl bg-surface shadow-soft">
              <img src={fileUrl(jobId, detectionImagePath(garment, id))} alt="" className="h-full w-full object-contain p-1.5" />
            </div>
            <p className="mt-1 truncate text-center text-[11px] text-slate-400">Bild {i + 1}</p>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

export default function MatchingReviewPage() {
  const { jobId } = useParams()
  const [garments, setGarments] = useState(null)
  const [decisions, setDecisions] = useState({})

  useEffect(() => {
    getJob(jobId).then((data) => {
      setGarments(data.result?.garments ?? [])
      setDecisions(data.workspace?.match_decisions ?? {})
    })
  }, [jobId])

  if (garments === null) {
    return (
      <div className="max-w-4xl space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const matched = garments.filter((g) => g.images.length > 1)
  const singles = garments.filter((g) => g.images.length === 1)

  async function decide(garmentId, decision) {
    setDecisions((prev) => ({ ...prev, [garmentId]: decision }))
    try {
      await patchWorkspace(jobId, { match_decisions: { [garmentId]: decision } })
      toast.success(
        decision === 'confirmed' ? 'Markerat som samma fysiska plagg.' : 'Markerat som olika plagg – uppdelningen har sparats.',
      )
    } catch (err) {
      toast.error(err.message || 'Kunde inte spara matchningsbeslutet')
    }
  }

  return (
    <div className="max-w-4xl">
      <Link to={`/projects/${jobId}`} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Tillbaka till projektet
      </Link>
      <h1 className="mt-4 font-display text-2xl font-bold text-slate-800 sm:text-3xl">Matchning av samma plagg</h1>
      <p className="mt-1 text-sm text-slate-500">
        Bekräfta eller avvisa varje AI-matchning i det här projektet manuellt.
      </p>

      <div className="mt-8 space-y-4">
        {matched.length === 0 ? (
          <EmptyState icon={Link2} title="Inget att matcha" description="Varje detektion här är ett enskilt, unikt plagg." />
        ) : (
          matched.map((garment) => (
            <MatchCard
              key={garment.id}
              garment={garment}
              jobId={jobId}
              decision={decisions[garment.id]}
              onDecide={decide}
            />
          ))
        )}
      </div>

      {singles.length > 0 && (
        <div className="mt-10">
          <h2 className="font-display text-lg font-bold text-slate-800">
            Plagg med en bild ({singles.length})
          </h2>
          <p className="mt-1 text-sm text-slate-500">De här förekom bara en gång – inget matchningsbeslut behövs.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {singles.map((g) => (
              <span key={g.id} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-soft">
                {categoryLabel(g.category)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
