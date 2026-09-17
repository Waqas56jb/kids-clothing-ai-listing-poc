import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, MessageCircle, Send } from 'lucide-react'
import { toast } from 'react-toastify'
import { getConversation, listThreads, sendListingMessage, storageUrl } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { refreshCounts } from '../../lib/useCounts'
import { formatDate, timeAgoSv } from '../../lib/sv'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

export default function MessagesPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const listingId = params.get('annons')
  const otherId = params.get('med')
  const [threads, setThreads] = useState(null)
  const [conversation, setConversation] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  const loadThreads = () =>
    listThreads()
      .then((data) => setThreads(data.threads))
      .catch((err) => toast.error(err.message || 'Kunde inte hämta meddelanden'))

  useEffect(() => {
    loadThreads()
  }, [])

  useEffect(() => {
    if (!listingId || !otherId) {
      setConversation(null)
      return undefined
    }
    let cancelled = false
    const load = () =>
      getConversation(listingId, otherId)
        .then((data) => {
          if (cancelled) return
          setConversation(data)
          refreshCounts()
        })
        .catch((err) => !cancelled && toast.error(err.message || 'Kunde inte hämta konversationen'))
    load()
    const timer = setInterval(load, 15000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [listingId, otherId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [conversation?.messages?.length])

  async function send(event) {
    event.preventDefault()
    if (!draft.trim() || !conversation) return
    setSending(true)
    try {
      const message = await sendListingMessage(listingId, { body: draft.trim(), recipientId: otherId })
      setConversation({ ...conversation, messages: [...conversation.messages, message] })
      setDraft('')
      loadThreads()
    } catch (err) {
      toast.error(err.message || 'Kunde inte skicka')
    } finally {
      setSending(false)
    }
  }

  const showList = !listingId || !otherId

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-display text-3xl font-semibold text-ink">Meddelanden</h1>
      <p className="mt-1 text-sm text-slate-500">Frågor och svar om annonser – mellan köpare och säljare.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className={`${showList ? 'block' : 'hidden lg:block'} rounded-3xl bg-white p-2 shadow-soft`}>
          {threads === null ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : threads.length === 0 ? (
            <div className="p-2">
              <EmptyState icon={MessageCircle} title="Inga konversationer" description="Skriv till en säljare från en annons så samlas svaren här." />
            </div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {threads.map((thread) => {
                const active = thread.listing_id === listingId && thread.other_id === otherId
                return (
                  <li key={`${thread.listing_id}-${thread.other_id}`}>
                    <button
                      type="button"
                      onClick={() => setParams({ annons: thread.listing_id, med: thread.other_id })}
                      className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${active ? 'bg-moss-soft/60' : 'hover:bg-sand/60'}`}
                    >
                      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-sand">
                        {thread.listing_cover && <img src={storageUrl(thread.listing_cover)} alt="" className="h-full w-full object-contain p-1" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-ink">{thread.other_name?.split(' ')[0] || 'Användare'}</span>
                          <span className="shrink-0 text-[11px] text-slate-400">{timeAgoSv(thread.last_at)}</span>
                        </span>
                        <span className="block truncate text-xs text-slate-500">{thread.listing_title}</span>
                        <span className="block truncate text-xs text-slate-400">
                          {thread.last_sender_id === user?.id ? 'Du: ' : ''}
                          {thread.last_body}
                        </span>
                      </span>
                      {thread.unread > 0 && (
                        <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white">{thread.unread}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        <section className={`${showList ? 'hidden lg:flex' : 'flex'} min-h-[60vh] flex-col rounded-3xl bg-white shadow-soft`}>
          {!conversation ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-400">
              {listingId ? <Skeleton className="h-40 w-full" /> : 'Välj en konversation till vänster.'}
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-slate-100 p-4">
                <button type="button" onClick={() => setParams({})} className="lg:hidden" aria-label="Tillbaka">
                  <ArrowLeft className="h-5 w-5 text-slate-500" />
                </button>
                <Link to={`/marknad/${conversation.listing.id}`} className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-sand">
                  {conversation.listing.cover_image && <img src={storageUrl(conversation.listing.cover_image)} alt="" className="h-full w-full object-contain p-1" />}
                </Link>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{conversation.other.name}</p>
                  <Link to={`/marknad/${conversation.listing.id}`} className="block truncate text-xs text-brand-700 hover:underline">
                    {conversation.listing.title} · {conversation.listing.price} kr
                  </Link>
                </div>
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {conversation.messages.map((message) => {
                  const mine = message.sender_id === user?.id
                  return (
                    <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${mine ? 'bg-ink text-sand' : 'bg-sand text-ink'}`}>
                        <p className="whitespace-pre-line break-words">{message.body}</p>
                        <p className={`mt-1 text-[10px] ${mine ? 'text-sand/60' : 'text-slate-400'}`}>{formatDate(message.created_at)}</p>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={send} className="flex items-end gap-2 border-t border-slate-100 p-3">
                <textarea
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send(e)
                    }
                  }}
                  placeholder="Skriv ett meddelande…"
                  className="flex-1 resize-none rounded-2xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                />
                <Button type="submit" disabled={sending || !draft.trim()}>
                  <Send className="h-4 w-4" /> Skicka
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
