import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Shirt } from 'lucide-react'
import { fileUrl, getJob } from '../../api'
import { conditionLabel, garmentImagePath, toneForCondition, toneForMatch } from '../../lib/garment'
import { categoryLabel } from '../../lib/sv'
import { Table, Thead, Th, Tr, Td } from '../ui/Table'
import Badge from '../ui/Badge'
import { Select } from '../ui/Input'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

export default function GarmentManagementPage() {
  const { jobId } = useParams()
  const [garments, setGarments] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('all')

  useEffect(() => {
    getJob(jobId).then((data) => setGarments(data.result?.garments ?? []))
  }, [jobId])

  const categories = useMemo(
    () => (garments ? Array.from(new Set(garments.map((g) => g.category))) : []),
    [garments],
  )
  const filtered = useMemo(() => {
    if (!garments) return []
    return categoryFilter === 'all' ? garments : garments.filter((g) => g.category === categoryFilter)
  }, [garments, categoryFilter])

  if (garments === null) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div>
      <Link to={`/projects/${jobId}`} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Projekt {jobId}
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-800 sm:text-3xl">Plagghantering</h1>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-48" aria-label="Filtrera på kategori">
          <option value="all">Alla kategorier</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={Shirt} title="Inga plagg" description="Inga plagg matchar det här filtret." />
        </div>
      ) : (
        <div className="mt-5">
          <Table>
            <Thead>
              <Th></Th>
              <Th>Kategori</Th>
              <Th>Märke</Th>
              <Th>Storlek</Th>
              <Th>Färg</Th>
              <Th>Skick</Th>
              <Th>Matchning</Th>
            </Thead>
            <tbody>
              {filtered.map((garment) => (
                <Tr key={garment.id}>
                  <Td>
                    <Link to={`/garments/${jobId}/${garment.detection_ids[0]}`}>
                      <div className="h-11 w-11 overflow-hidden rounded-lg bg-surface shadow-soft">
                        <img
                          src={fileUrl(jobId, garmentImagePath(garment))}
                          alt=""
                          className="h-full w-full object-contain p-0.5"
                        />
                      </div>
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      to={`/garments/${jobId}/${garment.detection_ids[0]}`}
                      className="font-semibold text-brand-700 hover:underline"
                    >
                      {categoryLabel(garment.category)}
                    </Link>
                  </Td>
                  <Td>{garment.brand ?? '—'}</Td>
                  <Td>{garment.size ?? '—'}</Td>
                  <Td className="capitalize">{garment.color ?? '—'}</Td>
                  <Td>
                    <Badge tone={toneForCondition(garment.condition, Boolean(garment.defects))}>{conditionLabel(garment)}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={toneForMatch(garment.match_status)}>{Math.round(garment.match_confidence * 100)} %</Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  )
}
