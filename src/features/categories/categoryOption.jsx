import CategoryIcon from '../../components/categories/CategoryIcon'

/**
 * Factory for a <Select renderOption> that shows a category's own icon
 * (from the DB, same as everywhere else it's displayed — CategoryIcon /
 * categoryIcons.js) in a colored chip next to its name. Pass the list of
 * categories so it can resolve the option value (category id) back to the
 * category. Mirrors accountOption.jsx's renderAccountOption.
 */
export function renderCategoryOption(categories = []) {
  const byId = new Map(categories.map((c) => [c.id, c]))
  return function CategoryOption({ value, label }) {
    const cat = byId.get(value)
    if (!cat) return <span className="min-w-0 flex-1 truncate">{label}</span>
    return (
      <>
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-lg"
          style={{ background: `${cat.color}1f`, color: cat.color }}
        >
          <CategoryIcon name={cat.icon} size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </>
    )
  }
}
