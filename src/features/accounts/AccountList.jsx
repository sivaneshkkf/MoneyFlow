import { Badge } from '../../components/common'
import AccountMenu from './AccountMenu'
import { maskedNumber, creditFigures, typeKey } from './accountTheme'
import { formatCurrency, formatRelative } from '../../utils/format'

function balanceCell(account) {
  if (typeKey(account.type) === 'credit_card') {
    const { outstanding } = creditFigures(account)
    return <span className="text-danger">−{formatCurrency(outstanding)}</span>
  }
  return formatCurrency(account.current_balance)
}

export default function AccountList({ accounts, menuProps }) {
  return (
    <>
      {/* desktop */}
      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft dark:border-white/10">
            <tr>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Institution</th>
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b border-line last:border-0 dark:border-white/5">
                <td className="px-4 py-3 font-medium">{a.name}</td>
                <td className="px-4 py-3 text-ink-soft">{a.type}</td>
                <td className="px-4 py-3 text-ink-soft">{a.institution || '—'}</td>
                <td className="px-4 py-3 font-mono text-ink-soft">{maskedNumber(a) || '—'}</td>
                <td className="px-4 py-3 text-right font-semibold">{balanceCell(a)}</td>
                <td className="px-4 py-3">
                  <Badge tone={a.is_active ? 'success' : 'neutral'}>{a.is_active ? 'Active' : 'Inactive'}</Badge>
                </td>
                <td className="px-4 py-3 text-ink-soft">{formatRelative(a.updated_at)}</td>
                <td className="px-4 py-3 text-right">
                  <AccountMenu account={a} tone="light" {...menuProps} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile */}
      <div className="space-y-2 md:hidden">
        {accounts.map((a) => (
          <div key={a.id} className="card p-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">{a.name}</p>
                <p className="text-xs text-ink-soft">
                  {a.type}
                  {a.institution ? ` · ${a.institution}` : ''}
                  {maskedNumber(a) ? ` · ${maskedNumber(a)}` : ''}
                </p>
              </div>
              <AccountMenu account={a} tone="light" {...menuProps} />
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2 dark:border-white/10">
              <Badge tone={a.is_active ? 'success' : 'neutral'}>{a.is_active ? 'Active' : 'Inactive'}</Badge>
              <span className="font-semibold">{balanceCell(a)}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
