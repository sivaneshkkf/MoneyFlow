import { supabase } from '../../lib/supabaseClient'

// Public — safe to ship in client code (this is the whole point of a VAPID
// *public* key). Set via Vercel/`.env`: VITE_VAPID_PUBLIC_KEY.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** 'default' | 'granted' | 'denied' | 'unsupported'. */
export function getPushPermission() {
  return isPushSupported() ? Notification.permission : 'unsupported'
}

export async function getExistingPushSubscription() {
  if (!isPushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

/** Requests permission (if needed), subscribes this device, and saves the
 * subscription server-side via save_push_subscription() — see
 * migrations/049_push_notifications.sql. */
export async function enablePushNotifications() {
  if (!isPushSupported()) throw new Error('Push notifications are not supported on this browser or device.')
  if (!VAPID_PUBLIC_KEY) throw new Error('Push notifications are not configured yet — please check back later.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(permission === 'denied' ? 'Notifications are blocked for MoneyFlow in your browser settings.' : 'Notification permission was not granted.')
  }

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const json = subscription.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
  return subscription
}

/** Unsubscribes this device and removes its row server-side. */
export async function disablePushNotifications() {
  if (!isPushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await supabase.rpc('delete_push_subscription', { p_endpoint: endpoint })
}
