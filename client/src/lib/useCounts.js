import { useCallback, useEffect, useState } from 'react'
import { listNotifications } from '../api'

const EVENT = 'miniplagg:counts'

/** Ask every mounted badge to refetch (after cart/offer/message actions). */
export function refreshCounts() {
  window.dispatchEvent(new Event(EVENT))
}

/** Unread notifications, unread messages and cart size for the signed-in user. */
export function useCounts(session) {
  const [counts, setCounts] = useState({ unread: 0, unreadMessages: 0, cartCount: 0 })

  const refresh = useCallback(() => {
    if (!session) {
      setCounts({ unread: 0, unreadMessages: 0, cartCount: 0 })
      return
    }
    listNotifications()
      .then((data) => setCounts({ unread: data.unread ?? 0, unreadMessages: data.unread_messages ?? 0, cartCount: data.cart_count ?? 0 }))
      .catch(() => {})
  }, [session])

  useEffect(() => {
    refresh()
    if (!session) return undefined
    const timer = setInterval(refresh, 30000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    window.addEventListener(EVENT, onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener(EVENT, onFocus)
    }
  }, [refresh, session])

  return { ...counts, refresh }
}
