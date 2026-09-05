import { Boxes } from 'lucide-react'
import SurfaceCard from './SurfaceCard'
import { formatCurrency } from '../../../utils/format'

export default function OtherAccountCard({ account, menuProps }) {
  return (
    <SurfaceCard
      account={account}
      icon={Boxes}
      eyebrow={account.institution || 'Custom account'}
      primaryLabel="Balance"
      primaryValue={formatCurrency(account.current_balance)}
      footer={account.metadata?.notes ? <span className="line-clamp-1">{account.metadata.notes}</span> : <span>Other account</span>}
      menuProps={menuProps}
    />
  )
}
