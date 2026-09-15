import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, Reorder } from 'framer-motion'
import { ImagePlus, Loader2, UploadCloud, X } from 'lucide-react'
import { toast } from 'react-toastify'
import { createJob } from '../../api'
import Button from '../ui/Button'

export default function UploadPage() {
  const [items, setItems] = useState([])
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
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
      .map((file) => ({ id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, url: URL.createObjectURL(file) }))
    if (incoming.length) setItems((prev) => [...prev, ...incoming])
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
      const { job_id } = await createJob(items.map((item) => item.file))
      navigate(`/processing/${job_id}`, { state: { photoCount: items.length } })
    } catch {
      toast.error('Could not upload those photos. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 py-10 sm:py-16">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <UploadCloud className="h-7 w-7" strokeWidth={1.75} />
      </span>
      <h1 className="mt-4 text-center font-display text-3xl font-bold text-slate-800 sm:text-4xl">
        New Upload Batch
      </h1>
      <p className="mt-2 max-w-lg text-center text-sm text-slate-500 sm:text-base">
        Upload 1–20+ photos of the clothes. Drag thumbnails to reorder, hover to remove one, then let AI detect,
        separate, and describe every item for you.
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
        <p className="mt-4 font-medium text-slate-700">Drag &amp; drop photos here</p>
        <p className="text-sm text-slate-400">or</p>
        <Button type="button" className="mt-3" onClick={() => inputRef.current?.click()}>
          Choose photos
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => addFiles(event.target.files)}
        />
      </div>

      {items.length > 0 && (
        <>
          <p className="mt-6 self-start text-xs font-semibold uppercase tracking-wide text-slate-400">
            {items.length} photo{items.length > 1 ? 's' : ''} · drag to reorder
          </p>
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
                    aria-label="Remove photo"
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
                Uploading…
              </>
            ) : (
              `Start AI Analysis · ${items.length} photo${items.length > 1 ? 's' : ''}`
            )}
          </Button>
        </>
      )}
    </div>
  )
}
