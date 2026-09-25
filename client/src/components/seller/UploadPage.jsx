import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, Reorder } from 'framer-motion'
import { ImagePlus, Loader2, UploadCloud, X } from 'lucide-react'
import { toast } from 'react-toastify'
import { createJob } from '../../api'
import { plural } from '../../lib/sv'
import Button from '../ui/Button'

const MAX_PHOTOS = 40
const RECOMMENDED_MAX = 30
// Phone photos are 10-12 MP; the AI works at 1600px, so sending more than
// this only slows the upload down. Proportions are always preserved.
const MAX_UPLOAD_EDGE = 2400

async function optimizeForUpload(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const longest = Math.max(bitmap.width, bitmap.height)
    if (longest <= MAX_UPLOAD_EDGE) {
      bitmap.close()
      return file
    }
    const scale = MAX_UPLOAD_EDGE / longest
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) return file
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    // HEIC or anything the browser can't decode: send the original as-is.
    return file
  }
}

export default function UploadPage() {
  const [items, setItems] = useState([])
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [statusText, setStatusText] = useState('')
  const inputRef = useRef(null)
  const navigate = useNavigate()

  // Revoke any still-live preview URLs on unmount only -- re-running this on
  // every `items` change would revoke URLs still referenced by the *next*
  // items array when adding more photos, breaking already-shown thumbnails.
  const itemsRef = useRef(items)
  itemsRef.current = items
  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url)), [])

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList)
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        url: URL.createObjectURL(file),
      }))
    if (!incoming.length) return
    setItems((prev) => {
      const room = MAX_PHOTOS - prev.length
      if (room <= 0) {
        toast.warn(`Max ${MAX_PHOTOS} bilder per omgång.`)
        return prev
      }
      if (incoming.length > room) toast.warn(`Bara ${room} bilder till får plats (max ${MAX_PHOTOS}).`)
      return [...prev, ...incoming.slice(0, room)]
    })
  }, [])

  const removeItem = (id) => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((item) => item.id !== id)
    })
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      setStatusText('Förbereder bilderna…')
      const files = await Promise.all(items.map((item) => optimizeForUpload(item.file)))
      setStatusText(`Laddar upp ${files.length} ${plural(files.length, 'bild', 'bilder')}…`)
      const { job_id } = await createJob(files)
      navigate(`/processing/${job_id}`, { state: { photoCount: items.length } })
    } catch (err) {
      toast.error(err.message || 'Kunde inte ladda upp bilderna. Försök igen.')
      setSubmitting(false)
      setStatusText('')
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 py-10 sm:py-16">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <UploadCloud className="h-7 w-7" strokeWidth={1.75} />
      </span>
      <h1 className="mt-4 text-center font-display text-3xl font-bold text-slate-800 sm:text-4xl">Ny uppladdning</h1>
      <p className="mt-2 max-w-lg text-center text-sm text-slate-500 sm:text-base">
        Ladda upp 20–30 bilder på kläderna åt gången (max {MAX_PHOTOS}). Dra för att ändra ordning, håll
        muspekaren över en bild för att ta bort den – sedan hittar AI:n och beskriver varje plagg.
      </p>

      <div
        className={`mt-8 w-full rounded-3xl border-2 border-dashed p-8 text-center transition-colors sm:p-12 ${
          dragging ? 'border-brand-400 bg-brand-50' : 'border-brand-200 bg-white'
        }`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          addFiles(event.dataTransfer.files)
        }}
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600">
          <ImagePlus className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <p className="mt-4 font-medium text-slate-700">Dra och släpp bilder här</p>
        <p className="text-sm text-slate-400">eller</p>
        <Button type="button" className="mt-3" onClick={() => inputRef.current?.click()}>
          Välj bilder
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </div>

      {items.length > 0 && (
        <>
          <div className="mt-6 flex w-full items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {items.length} {plural(items.length, 'bild', 'bilder')} · dra för att ändra ordning
            </p>
            {items.length > RECOMMENDED_MAX && (
              <p className="text-xs font-medium text-amber-700">
                Fler än {RECOMMENDED_MAX} bilder tar längre tid att bearbeta.
              </p>
            )}
          </div>
          <Reorder.Group
            axis="x"
            values={items}
            onReorder={setItems}
            className="mt-2 grid w-full grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5"
          >
            <AnimatePresence>
              {items.map((item) => (
                <Reorder.Item
                  key={item.id}
                  value={item}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  whileDrag={{ scale: 1.05, zIndex: 10, boxShadow: '0 12px 24px -6px rgb(15 23 42 / 0.25)' }}
                  className="group relative aspect-square cursor-grab overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-black/5 active:cursor-grabbing"
                >
                  <img src={item.url} alt="" className="h-full w-full object-cover" draggable={false} />
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label="Ta bort bild"
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/60 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Reorder.Item>
              ))}
            </AnimatePresence>
          </Reorder.Group>

          <Button size="lg" className="mt-8 w-full max-w-xs" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {statusText || 'Laddar upp…'}
              </>
            ) : (
              `Starta AI-analys · ${items.length} ${plural(items.length, 'bild', 'bilder')}`
            )}
          </Button>
        </>
      )}
    </div>
  )
}
