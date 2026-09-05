import { resolveIcon } from './categoryIcons'

/**
 * Render a category's icon from its stored Lucide name.
 * Presentation only — never throws, falls back to MoreHorizontal.
 */
export default function CategoryIcon({ name, size = 18, className = '', strokeWidth = 2 }) {
  const Icon = resolveIcon(name)
  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />
}
