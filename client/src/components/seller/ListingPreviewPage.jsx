import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { fileUrl, getJob } from '../../api'
import { generateDescription, generateTitle } from '../../lib/listing'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import { useToast } from '../ui/Toast'

function ListingCard({ jobId, garment, index }) {
  const [title, setTitle] = useState(() => generateTitle(garment))
  const [description, setDescription] = useState(() => generateDescription(garment))
  const [approved, setApproved] = useState(false)
  const toast = useToast()

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4) }}
      className="grid grid-cols-1 gap-5 rounded-2xl bg-white p-5 shadow-soft sm:grid-cols-[140px_1fr]"
    >
      <div className="aspect-square w-full overflow-hidden rounded-xl bg-surface sm:w-[140px]">
        <img
          src={fileUrl(jobId, `debug/masks/${garment.detection_ids[0]}_masked.png`)}
          alt={garment.category}
          className="h-full w-full object-contain p-2"
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-lg border border-transparent bg-transparent font-display text-base font-bold text-slate-800 outline-none transition focus:border-slate-200 focus:bg-slate-50 focus:px-2 focus:py-1"
          />
          {approved ? <Badge tone="good">Approved</Badge> : <Badge tone="neutral">Draft</Badge>}
        </div>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          className="w-full resize-none rounded-xl border border-slate-200 bg-surface/50 p-3 text-sm text-slate-600 outline-none transition focus:border-brand-300 focus:bg-white focus:ring-4 focus:ring-brand-100"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              setApproved(true)
              toast('Listing approved for publishing.', 'success')
            }}
          >
            Approve listing
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setTitle(generateTitle(garment))
              setDescription(generateDescription(garment))
              setApproved(false)
            }}
          >
            Reset
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

export default function ListingPreviewPage() {
  const { jobId } = useParams()
  const [garments, setGarments] = useState(null)

  useEffect(() => {
    getJob(jobId).then((data) => setGarments(data.result?.garments ?? []))
  }, [jobId])

  if (garments === null) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Link to={`/results/${jobId}`} className="text-sm font-medium text-brand-600 hover:underline">
        ← Back to results
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">Listing Preview</h1>
        <Badge tone="info">Preview</Badge>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Draft listing copy templated from AI-extracted attributes only — nothing invented. Edit freely, then
        approve. Real AI-generated copy and publishing land with backend integration.
      </p>

      <div className="mt-8 space-y-4">
        {garments.length === 0 ? (
          <EmptyState icon="🏷️" title="Nothing to list" description="No garments were detected in this batch." />
        ) : (
          garments.map((garment, index) => (
            <ListingCard key={garment.id} jobId={jobId} garment={garment} index={index} />
          ))
        )}
      </div>
    </div>
  )
}
