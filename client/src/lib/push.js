import { getPushPublicKey, removePushSubscription, savePushSubscription } from '../api'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js')
}

export async function currentPushSubscription() {
  if (!pushSupported()) return null
  try {
    const reg = await registration()
    return await reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('Push-notiser stöds inte i den här webbläsaren.')
  const { public_key: publicKey, enabled } = await getPushPublicKey()
  if (!enabled || !publicKey) throw new Error('Push-notiser är inte aktiverade på servern än.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Du behöver tillåta notiser i webbläsaren.')
  const reg = await registration()
  const existing = await reg.pushManager.getSubscription()
  const subscription =
    existing ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }))
  await savePushSubscription(subscription.toJSON())
  return subscription
}

export async function disablePush() {
  const subscription = await currentPushSubscription()
  if (!subscription) return
  await removePushSubscription(subscription.endpoint).catch(() => {})
  await subscription.unsubscribe()
}
