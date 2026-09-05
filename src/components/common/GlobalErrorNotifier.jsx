import { useEffect } from 'react'
import { useToast } from './ToastProvider'
import { friendlyError } from '../../utils/errors'

/**
 * Last-resort safety net: shows a toast for any promise rejection or thrown
 * error that slips past a component's own try/catch — a forgotten .catch()
 * on a mutation, a raw fetch that throws, a genuine network failure. Every
 * page still owns its own specific error handling (this never replaces
 * that); this only guarantees an error is never silently swallowed with no
 * user-facing sign anything went wrong.
 */
export default function GlobalErrorNotifier() {
  const toast = useToast()

  useEffect(() => {
    const onRejection = (event) => {
      // eslint-disable-next-line no-console
      console.error('Unhandled promise rejection:', event.reason)
      toast.error(friendlyError(event.reason, 'Something went wrong. Please try again.'))
    }
    const onError = (event) => {
      // Ignore benign cross-origin script noise ("Script error." with no detail).
      if (!event.error && event.message === 'Script error.') return
      // eslint-disable-next-line no-console
      console.error('Unhandled error:', event.error ?? event.message)
      toast.error(friendlyError(event.error ?? event.message, 'Something went wrong. Please try again.'))
    }

    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('error', onError)
    return () => {
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('error', onError)
    }
  }, [toast])

  return null
}
