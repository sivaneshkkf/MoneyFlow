import { useEffect } from 'react'

const SITE_NAME = 'MoneyFlow'

/**
 * Minimal per-page <title> / meta description setter — no react-helmet or
 * similar dependency, just a direct DOM update on mount/route change.
 * Restores the app's default title on unmount so navigating into the
 * authenticated app doesn't leave a stale public-page title behind.
 */
export default function Seo({ title, description }) {
  useEffect(() => {
    const prevTitle = document.title
    document.title = title ? `${title} — ${SITE_NAME}` : SITE_NAME

    let meta = document.querySelector('meta[name="description"]')
    const prevDescription = meta?.getAttribute('content') ?? null
    if (description) {
      if (!meta) {
        meta = document.createElement('meta')
        meta.setAttribute('name', 'description')
        document.head.appendChild(meta)
      }
      meta.setAttribute('content', description)
    }

    return () => {
      document.title = prevTitle
      if (description && meta && prevDescription != null) {
        meta.setAttribute('content', prevDescription)
      }
    }
  }, [title, description])

  return null
}
