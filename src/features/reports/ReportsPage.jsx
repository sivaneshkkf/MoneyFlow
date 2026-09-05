import { useState } from "react";
import { addMonths, format, subMonths } from "date-fns";
import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Coins,
  Percent,
  ArrowRight,
  ArrowLeft,
  TrendingUp,
  CreditCard,
  Info,
  Lightbulb,
  BarChart3,
} from "lucide-react";
import { PageContainer, Skeleton, ErrorState } from "../../components/common";
import { useMonthlyReport } from "./useReport";
import { formatCurrency } from "../../utils/format";
import { downloadCSV } from "../../utils/csv";

function MetricRow({ icon: Icon, tint, label, sub, value, valueColor }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tint}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">{label}</p>
        {sub && <p className="truncate text-xs text-ink-soft">{sub}</p>}
      </div>
      <span className={`shrink-0 font-bold ${valueColor ?? ""}`}>{value}</span>
    </div>
  );
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth() + 1;
  const { data, isLoading, isError, refetch } = useMonthlyReport(year, month);

  const months = Array.from({ length: 12 }, (_, i) => subMonths(new Date(), i));

  const exportCSV = () => {
    if (!data) return;
    const rows = [
      { metric: "Income", amount: data.income },
      { metric: "Expenses", amount: data.expenses },
      { metric: "Net operating savings", amount: data.netSavings },
      { metric: "Savings rate %", amount: data.savingsRate },
      { metric: "Money lent", amount: data.moneyLent },
      { metric: "Principal received", amount: data.principalReceived },
      { metric: "Interest received", amount: data.interestReceived },
      { metric: "Cash flow", amount: data.cashFlow },
      { metric: "Outstanding lending", amount: data.outstandingLending },
      ...data.categories.map((c) => ({
        metric: `Expense: ${c.name}`,
        amount: c.total,
      })),
    ];
    downloadCSV(
      `moneyflow-report-${year}-${String(month).padStart(2, "0")}.csv`,
      rows,
    );
  };

  const top = data?.categories?.[0];

  return (
    <PageContainer>
      {/* header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-success/12 text-success">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
            <p className="text-sm text-ink-soft">
              Monthly financial summaries with each concept kept separate.
            </p>
          </div>
        </div>
        <div className="no-print flex gap-2">
          <button className="btn-ghost" onClick={exportCSV} disabled={!data}>
            <Download className="h-4 w-4" /> CSV
          </button>
          <button
            className="btn-ghost"
            onClick={() => window.print()}
            disabled={!data}
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>

      <div className="no-print mb-5 flex items-center gap-2">
        <button
          className="btn-ghost !rounded-full !p-2"
          onClick={() => setCursor((c) => subMonths(c, 1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold dark:border-white/10 dark:bg-white/5">
          <Calendar className="h-4 w-4 text-ink-soft" />{" "}
          {format(cursor, "MMMM yyyy")}
        </span>
        <button
          className="btn-ghost !rounded-full !p-2"
          onClick={() => setCursor((c) => addMonths(c, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : isError ? (
        <ErrorState message="Unable to load this report." onRetry={refetch} />
      ) : (
        <div className="space-y-6">
          {/* --- summary card --- */}
          <div className="card relative overflow-hidden bg-gradient-to-br from-success/[0.05] via-white to-white p-6 dark:via-[#161F1D] dark:to-[#161F1D]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-10 top-4 h-56 w-56 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(34,197,94,0.12), transparent 70%)",
              }}
            />

            <div className="relative flex flex-wrap items-start justify-between gap-3">
              <div className="border-l-4 border-success pl-3">
                <h2 className="text-lg font-bold">MoneyFlow — {data.period}</h2>
                <p className="text-sm text-ink-soft">
                  A complete summary of your money flow for this month.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white/70 px-2.5 py-1 text-xs text-ink-soft dark:border-white/10 dark:bg-white/5">
                <Calendar className="h-3.5 w-3.5" /> Generated{" "}
                {format(new Date(), "dd MMM yyyy")}
              </span>
            </div>

            <div className="relative mt-4 grid gap-x-10 sm:grid-cols-[1fr_1fr_auto]">
              <div className="sm:pr-8">
                <MetricRow
                  icon={ArrowUpRight}
                  tint="bg-success/12 text-success"
                  label="Income"
                  sub="Total money received"
                  value={formatCurrency(data.income)}
                  valueColor="text-success"
                />
                <MetricRow
                  icon={ArrowDownRight}
                  tint="bg-danger/12 text-danger"
                  label="Expenses"
                  sub="Total money spent"
                  value={formatCurrency(data.expenses)}
                  valueColor="text-danger"
                />
                <MetricRow
                  icon={Coins}
                  tint="bg-info/12 text-info"
                  label="Net operating savings"
                  sub="Income – Expenses"
                  value={formatCurrency(data.netSavings)}
                />
                <MetricRow
                  icon={Percent}
                  tint="bg-[#8B5CF6]/12 text-[#8B5CF6]"
                  label="Savings rate"
                  sub="Percentage of income saved"
                  value={`${data.savingsRate.toFixed(1)}%`}
                />
              </div>
              <div className="sm:border-l sm:border-line sm:pl-8 dark:sm:border-white/10">
                <MetricRow
                  icon={ArrowRight}
                  tint="bg-warning/12 text-warning"
                  label="Money lent"
                  sub="Amount given to others"
                  value={formatCurrency(data.moneyLent)}
                />
                <MetricRow
                  icon={ArrowLeft}
                  tint="bg-[#8B5CF6]/12 text-[#8B5CF6]"
                  label="Principal received"
                  sub="Loan principal returned"
                  value={formatCurrency(data.principalReceived)}
                />
                <MetricRow
                  icon={Percent}
                  tint="bg-success/12 text-success"
                  label="Interest received"
                  sub="Interest from loans"
                  value={formatCurrency(data.interestReceived)}
                  valueColor="text-success"
                />
                <MetricRow
                  icon={TrendingUp}
                  tint="bg-info/12 text-info"
                  label="Cash flow"
                  sub="Income – Expenses – Money lent + Principal + Interest"
                  value={formatCurrency(data.cashFlow)}
                />
                <MetricRow
                  icon={CreditCard}
                  tint="bg-danger/12 text-danger"
                  label="Outstanding lending"
                  sub="Amount yet to be received"
                  value={formatCurrency(data.outstandingLending)}
                />
              </div>
              <img
                src="/reportImg.png"
                alt=""
                aria-hidden="true"
                className="no-print pointer-events-none hidden w-64 select-none object-contain xl:block"
              />
            </div>

            <div className="relative -mx-6 -mb-6 mt-5 flex items-start gap-2.5 border-t border-success/15 bg-success/[0.06] px-6 py-3 text-xs text-ink-soft dark:bg-success/10">
              <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-success text-white">
                <Info className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
              <span>
                Cash flow = income − expenses − money lent + principal received
                + interest received. Money lent is a transfer to receivables,
                not an expense; principal received is not income.
              </span>
            </div>
          </div>

          {/* --- expense breakdown --- */}
          <div className="card p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div className="border-l-4 border-success pl-3">
                <h2 className="text-lg font-bold">Expense breakdown</h2>
                <p className="text-sm text-ink-soft">
                  Your spending distribution for {data.period}.
                </p>
              </div>
              <select
                className="input !w-auto no-print"
                value={format(cursor, "yyyy-MM")}
                onChange={(e) =>
                  setCursor(new Date(`${e.target.value}-01T00:00:00`))
                }
              >
                {months.map((m) => (
                  <option key={+m} value={format(m, "yyyy-MM")}>
                    {format(m, "MMMM yyyy")}
                  </option>
                ))}
              </select>
            </div>

            {data.categories.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-soft">
                No expenses recorded this month.
              </p>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
                <div className="relative mx-auto h-44 w-44 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.categories}
                        dataKey="total"
                        nameKey="name"
                        innerRadius={54}
                        outerRadius={82}
                        paddingAngle={2}
                      >
                        {data.categories.map((c) => (
                          <Cell key={c.name} fill={c.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v, n) => [formatCurrency(v), n]}
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid #E4E9E7",
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[11px] text-ink-soft">
                      Total Expenses
                    </span>
                    <span className="text-lg font-bold">
                      {formatCurrency(data.expenses)}
                    </span>
                  </div>
                </div>

                <ul className="min-w-0 space-y-2.5">
                  {data.categories.slice(0, 6).map((c) => {
                    const pct =
                      data.expenses > 0 ? (c.total / data.expenses) * 100 : 0;
                    return (
                      <li
                        key={c.name}
                        className="flex items-center gap-3 text-sm"
                      >
                        <span className="flex w-40 min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: c.color }}
                          />
                          <span className="truncate">{c.name}</span>
                        </span>
                        <span className="w-20 shrink-0 text-right font-semibold">
                          {formatCurrency(c.total)}
                        </span>
                        <span className="w-10 shrink-0 text-right text-xs text-ink-soft">
                          {Math.round(pct)}%
                        </span>
                        <span className="hidden h-2 flex-1 overflow-hidden rounded-full bg-brand-400/15 dark:bg-white/10 sm:block">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${pct}%`, background: c.color }}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {top && (
                  <div className="rounded-2xl border border-success/25 bg-success/[0.06] p-4 lg:w-64">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                      <Lightbulb className="h-4 w-4" /> Insight
                    </p>
                    <p className="mt-1.5 text-sm text-ink-soft">
                      <b className="text-ink">{top.name}</b> category accounts
                      for{" "}
                      <b className="text-success">
                        {data.expenses > 0
                          ? Math.round((top.total / data.expenses) * 100)
                          : 0}
                        %
                      </b>{" "}
                      of your total expenses this month.
                    </p>
                    <button
                      className="btn-ghost mt-3 w-full !py-1.5 text-xs no-print"
                      onClick={() => navigate("/settings/categories")}
                    >
                      <BarChart3 className="h-3.5 w-3.5" /> Manage Categories
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
