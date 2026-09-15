import { useCallback, useEffect, useRef, useState } from 'react'

export default function UploadScreen({ onSubmit }) {
  const [items, setItems] = useState([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  // Revoke any still-live preview URLs on unmount only. Re-running this
  // cleanup on every `items` change (a naive `[items]` dependency) would
  // revoke URLs still referenced by the *next* items array when adding more
  // photos, breaking already-shown thumbnails; `removeItem` below already
  // revokes a URL the moment its photo is actually removed.
  const itemsRef = useRef(items)
  itemsRef.current = items
  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url)), [])

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList)
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => ({ file, url: URL.createObjectURL(file) }))
    if (incoming.length) setItems((prev) => [...prev, ...incoming])
  }, [])

  const removeItem = (index) => {
    setItems((prev) => {
      URL.revokeObjectURL(prev[index].url)
      return prev.filter((_, i) => i !== index)
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-10 sm:py-16">
      <span className="text-4xl">🧸</span>
      <h1 className="mt-3 text-center font-display text-3xl font-bold text-slate-800 sm:text-4xl">
        AI Clothing Listing
      </h1>
      <p className="mt-2 max-w-md text-center text-sm text-slate-500 sm:text-base">
        Upload photos of the clothes and let AI detect, separate, and describe every item for you.
      </p>

      <div
        className={`mt-8 w-full rounded-3xl border-2 border-dashed p-8 text-center transition sm:p-12 ${
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
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-2xl">
          📸
        </div>
        <p className="mt-4 font-medium text-slate-700">Drag & drop photos here</p>
        <p className="text-sm text-slate-400">or</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-3 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/30 transition hover:bg-brand-600 active:scale-95"
        >
          Choose photos
        </button>
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
          <div className="mt-6 grid w-full grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {items.map((item, index) => (
              <div
                key={item.url}
                className="group relative aspect-square overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5"
              >
                <img src={item.url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  aria-label="Remove photo"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onSubmit(items.map((item) => item.file))}
            className="mt-8 w-full max-w-xs rounded-full bg-brand-500 px-6 py-3.5 font-display text-base font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600 active:scale-95 sm:w-auto"
          >
            Start AI Analysis · {items.length} photo{items.length > 1 ? 's' : ''}
          </button>
        </>
      )}
    </div>
  )
}
