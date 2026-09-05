import { Link } from "react-router-dom";
import { SectionHeader, Skeleton } from "../../../components/common";
import { formatCurrency } from "../../../utils/format";
import { useDashboardMetrics } from "../useDashboard";

export default function LendingOverview() {
  const { data, isLoading } = useDashboardMetrics();
  if (isLoading || !data)
    return (
      <div className="card p-5">
        <Skeleton className="h-40 w-full" />
      </div>
    );

  const rows = [
    ["Total Lent", data.moneyLent, "text-ink"],
    ["Outstanding", data.receivable, "text-warning"],
    ["Interest Earned", data.interestEarned, "text-success"],
    ["Overdue", data.overdue, "text-danger"],
  ];

  return (
    <div className="card p-5">
      <SectionHeader
        title="Lending Overview"
        action={
          <Link
            to="/lending/given"
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            View all
          </Link>
        }
      />
      <div className="relative flex items-start justify-start gap-4">
        <dl className="grid grid-cols-2 gap-12">
          {rows.map(([label, value, tone]) => (
            <div key={label}>
              <dt className="text-xs text-ink-soft">{label}</dt>
              <dd className={`text-lg font-bold ${tone}`}>
                {formatCurrency(value)}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col"></div>
        <img
          src="/walletImg.png"
          alt=""
          aria-hidden="true"
          className="absolute right-0 top-0 hidden w-40 shrink-0 select-none object-contain sm:block lg:w-80"
        />
      </div>
    </div>
  );
}
