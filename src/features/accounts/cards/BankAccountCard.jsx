import { Landmark } from 'lucide-react'
import SurfaceCard from './SurfaceCard'
import { maskedNumber } from '../accountTheme'
import { formatCurrency } from '../../../utils/format'

export default function BankAccountCard({ account, menuProps }) {
  const masked = maskedNumber(account)
  const subtype = account.metadata?.subtype
  const ifsc = account.metadata?.ifsc

  return (
    <SurfaceCard
      account={account}
      icon={Landmark}
      eyebrow={account.institution || 'Bank account'}
      primaryLabel="Available balance"
      primaryValue={formatCurrency(account.current_balance)}
      footer={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span>{subtype ? `${subtype} account` : 'Bank account'}</span>
          {masked && <span className="font-mono tracking-wider">{masked}</span>}
          {ifsc && <span>IFSC {ifsc}</span>}
        </div>
      }
      menuProps={menuProps}
    />
  )
}
