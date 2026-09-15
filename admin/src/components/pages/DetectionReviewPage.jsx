import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { toast } from 'react-toastify'
import { fileUrl, getJob, patchWorkspace } from '../../api'
import { toneForMatch } from '../../lib/garment'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import { Table, Thead, Th, Tr, Td } from '../ui/Table'

function confidenceTone(value) {
  if (value >= 0.8) return 'good'
  if (value >= 0.5) return 'ok'
  return 'bad'
}

export default function DetectionReviewPage() {
  const { jobId, detectionId } = useParams()
  const [job, setJob] = useState(null)
  const [form, setForm] = useState(null)

  useEffect(() => {
    getJob(jobId).then((data) => {
      setJob(data)
      const found = data.result?.garments.find((g) => g.detection_ids.includes(detectionId))
      if (found) setForm({ ...found })
    })
  }, [jobId, detectionId])

  if (!job) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  const garment = job.result?.garments.find((g) => g.detection_ids.includes(detectionId))
  if (!garment) return <p className="text-sm text-slate-500">Detection not found.</p>
  if (!form) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  const fields = ['category', 'brand', 'size', 'color', 'condition', 'gender']

  return (
    <div>
      <Link to={`/garments/${jobId}`} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Garment management
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold capitalize text-slate-800 sm:text-3xl">
          {garment.category.replace(/_/g, ' ')}
        </h1>
        <Badge tone={toneForMatch(garment.match_status)}>{garment.match_status.replace(/_/g, ' ')}</Badge>
      </div>
      <p className="mt-1 font-mono text-xs text-slate-400">garment id: {garment.id}</p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {garment.detection_ids.map((id) => (
              <div key={id} className="rounded-2xl bg-white p-2 shadow-soft">
                <div className="aspect-square overflow-hidden rounded-xl bg-surface">
                  <img src={fileUrl(jobId, `debug/masks/${id}_masked.png`)} alt="" className="h-full w-full object-contain p-1" />
                </div>
                <p className="mt-1.5 truncate text-center font-mono text-[10px] text-slate-400">{id}</p>
              </div>
            ))}
          </div>

          {garment.defects && (
            <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Flagged defect: <strong>{garment.defects}</strong>
              </span>
            </div>
          )}
        </div>

        <div>
          <h2 className="font-display text-base font-bold text-slate-800">Extracted attributes &amp; confidence</h2>
          <div className="mt-3">
            <Table>
              <Thead>
                <Th>Field</Th>
                <Th>Value</Th>
                <Th>Confidence</Th>
              </Thead>
              <tbody>
                {fields.map((field) => (
                  <Tr key={field}>
                    <Td className="capitalize font-medium text-slate-500">{field}</Td>
                    <Td className="capitalize">
                      <input
                        value={form[field] ?? ''}
                        onChange={(event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                      />
                    </Td>
                    <Td>
                      <Badge tone={confidenceTone(garment.confidence?.[field] ?? 0)}>
                        {Math.round((garment.confidence?.[field] ?? 0) * 100)}%
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="mt-4">
            <Button
              onClick={async () => {
                try {
                  await patchWorkspace(jobId, {
                    garment_edits: {
                      [garment.id]: {
                        category: form.category,
                        brand: form.brand,
                        size: form.size,
                        color: form.color,
                        condition: form.condition,
                        gender: form.gender,
                      },
                    },
                  })
                  toast.success('Saved to the database.')
                } catch (err) {
                  toast.error(err.message || 'Could not save')
                }
              }}
            >
              Save changes
            </Button>
          </div>

          <h2 className="mt-6 font-display text-base font-bold text-slate-800">Matching</h2>
          <div className="mt-3 rounded-2xl bg-white p-4 shadow-soft text-sm">
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Match confidence</span>
              <span className="font-semibold text-slate-800">{Math.round(garment.match_confidence * 100)}%</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Source photos</span>
              <span className="font-semibold text-slate-800">{garment.images.length}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Detections merged</span>
              <span className="font-semibold text-slate-800">{garment.detection_ids.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
