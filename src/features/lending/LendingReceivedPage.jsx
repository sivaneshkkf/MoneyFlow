import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Download,
  ArrowDownLeft,
  Coins,
  Percent,
  Wallet,
  Calendar,
  Filter,
  RotateCcw,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Trash2,
} from "lucide-react";
import {
  PageContainer,
  EmptyState,
  Skeleton,
  ErrorState,
  InfoDot,
} from "../../components/common";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import {
  useReceivedRepayments,
  summariseRepayments,
  useLendingMutations,
} from "./useLending";
import { formatCurrency, formatDate } from "../../utils/format";
import { downloadCSV } from "../../utils/csv";
import { useToast } from "../../components/common/ToastProvider";
import { friendlyError } from "../../utils/errors";

const PAGE_SIZE = 10;

function Bars({ color }) {
  return (
    <svg
      width="52"
      height="34"
      viewBox="0 0 52 34"
      aria-hidden="true"
      className="shrink-0"
    >
      {[8, 14, 20, 26, 32].map((h, i) => (
        <rect
          key={i}
          x={i * 10}
          y={34 - h}
          width="7"
          height={h}
          rx="2"
          fill={color}
          fillOpacity={0.25 + i * 0.12}
        />
      ))}
    </svg>
  );
}

function StatTile({ icon: Icon, tint, label, value, foot, info, valueColor }) {
  return (
    <div className={`rounded-2xl border p-4 ${tint.card} backdrop-blur-[3px]`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-sm text-ink-soft">
            {label}
            {info && <InfoDot text={info} />}
          </p>
          <p
            className={`mt-1 text-2xl font-bold tracking-tight ${valueColor ?? ""}`}
          >
            {value}
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">{foot}</p>
        </div>
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tint.icon}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 flex justify-end">
        <Bars color={tint.bar} />
      </div>
    </div>
  );
}

const TINTS = {
  green: {
    card: "border-success/20 bg-success/[0.06]",
    icon: "bg-success/15 text-success",
    bar: "#22C55E",
  },
  indigo: {
    card: "border-[#8B5CF6]/20 bg-[#8B5CF6]/[0.06]",
    icon: "bg-[#8B5CF6]/15 text-[#8B5CF6]",
    bar: "#8B5CF6",
  },
};

function RowMenu({ onView, onDelete }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({});
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const r = btnRef.current?.getBoundingClientRect();
    if (r)
      setPos({
        position: "fixed",
        top: r.bottom + 6,
        left: Math.max(8, r.right - 160),
        width: 160,
      });
    const close = (e) => {
      if (
        !btnRef.current?.contains(e.target) &&
        !menuRef.current?.contains(e.target)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", () => setOpen(false), true);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Actions"
        className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-soft transition hover:bg-brand-50 hover:text-ink dark:border-white/10 dark:hover:bg-white/5"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={pos}
            className="z-[120] overflow-hidden rounded-xl border border-line bg-white py-1 shadow-xl dark:border-white/10 dark:bg-[#1B2523]"
          >
            <button
              onClick={() => {
                setOpen(false);
                onView();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-brand-50 dark:hover:bg-white/5"
            >
              <Eye className="h-4 w-4 text-ink-soft" /> View loan
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

function SortTh({ label, field, sort, setSort, align = "left" }) {
  const active = sort.field === field;
  return (
    <th className={`px-5 py-3.5 ${align === "right" ? "text-right" : ""}`}>
      <button
        className={`inline-flex items-center gap-1 ${active ? "text-ink" : ""}`}
        onClick={() =>
          setSort((s) => ({
            field,
            dir: s.field === field && s.dir === "asc" ? "desc" : "asc",
          }))
        }
      >
        {label}
        <ChevronsUpDown className="h-3 w-3 opacity-60" />
      </button>
    </th>
  );
}

export default function LendingReceivedPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { deleteRepayment } = useLendingMutations();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState({ field: "date", dir: "desc" });
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(null);

  const { data, isLoading, isError, refetch } = useReceivedRepayments({
    from,
    to,
  });

  const filtered = useMemo(() => {
    const all = data ?? [];
    const s = search.trim().toLowerCase();
    const rows = s
      ? all.filter((r) => r.record?.borrower_name?.toLowerCase().includes(s))
      : all;
    const pick = {
      date: (r) => r.payment_date,
      borrower: (r) => r.record?.borrower_name ?? "",
      principal: (r) => Number(r.principal_amount),
      interest: (r) => Number(r.interest_amount),
      total: (r) => Number(r.amount),
      account: (r) => r.account?.name ?? "",
    }[sort.field];
    return [...rows].sort((a, b) => {
      const av = pick(a);
      const bv = pick(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [data, search, sort]);

  const totals = useMemo(() => summariseRepayments(filtered), [filtered]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const count = data?.length ?? 0;

  const reset = () => {
    setSearch("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const exportCSV = () =>
    downloadCSV(
      "moneyflow-money-received.csv",
      filtered.map((r) => ({
        date: r.payment_date,
        borrower: r.record?.borrower_name ?? "",
        principal: r.principal_amount,
        interest: r.interest_amount,
        total: r.amount,
        account: r.account?.name ?? "",
        payment_method: r.payment_method?.name ?? "",
      })),
    );

  const confirmDelete = async () => {
    try {
      await deleteRepayment.mutateAsync(deleting.id);
      toast.success("Repayment removed.");
      setDeleting(null);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <PageContainer
      title="Money Received"
      subtitle="Every repayment you've collected — principal and interest kept separate."
      action={
        <div className="flex items-center gap-5">
          <button
            className="btn-ghost"
            onClick={exportCSV}
            disabled={!filtered.length}
          >
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      }
    >
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError ? (
        <ErrorState message="Unable to load repayments." onRetry={refetch} />
      ) : (
        <>
          <img
            src="/walletImg.png"
            alt=""
            aria-hidden="true"
            className="absolute right-32 top-10 -z-10 pointer-events-none hidden w-60 select-none object-contain xl:block"
          />
          <div className="grid gap-4 sm:grid-cols-3 z-10">
            <StatTile
              icon={Coins}
              tint={TINTS.green}
              label="Principal received"
              value={formatCurrency(totals.principal)}
              valueColor="text-success"
              foot={`From ${count} repayment${count === 1 ? "" : "s"}`}
              info="Repaid principal returns your cash — it is not income."
            />
            <StatTile
              icon={Percent}
              tint={TINTS.indigo}
              label="Interest received"
              value={formatCurrency(totals.interest)}
              foot={`From ${count} repayment${count === 1 ? "" : "s"}`}
              info="Only the interest portion of a repayment counts as income."
            />
            <StatTile
              icon={Wallet}
              tint={TINTS.green}
              label="Total received"
              value={formatCurrency(totals.total)}
              valueColor="text-success"
              foot="Principal + Interest"
            />
          </div>

          {/* filter bar */}
          <div className="mt-4 card grid gap-3 p-4 lg:grid-cols-[1.4fr_1fr_1fr_auto_auto] lg:items-end">
            <div>
              <label className="label">Borrower</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
                <input
                  className="input pl-10"
                  placeholder="Search borrower…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
            <div>
              <label className="label">From date</label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
                <input
                  type="date"
                  className="input pl-10"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="label">To date</label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
                <input
                  type="date"
                  className="input pl-10"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
            <button className="btn-primary" onClick={() => setPage(1)}>
              <Filter className="h-4 w-4" /> Filter
            </button>
            <button className="btn-ghost" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
          </div>

          {/* table */}
          {filtered.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={ArrowDownLeft}
                title="No repayments yet"
                description="Record a repayment on a lending record to see it here."
              />
            </div>
          ) : (
            <div className="mt-4 card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-line bg-brand-50/40 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-soft dark:border-white/10 dark:bg-white/[0.03]">
                    <tr>
                      <th className="px-5 py-3.5 text-ink-soft">#</th>
                      <SortTh
                        label="Date"
                        field="date"
                        sort={sort}
                        setSort={setSort}
                      />
                      <SortTh
                        label="Borrower"
                        field="borrower"
                        sort={sort}
                        setSort={setSort}
                      />
                      <SortTh
                        label="Principal"
                        field="principal"
                        sort={sort}
                        setSort={setSort}
                        align="right"
                      />
                      <SortTh
                        label="Interest"
                        field="interest"
                        sort={sort}
                        setSort={setSort}
                        align="right"
                      />
                      <SortTh
                        label="Total"
                        field="total"
                        sort={sort}
                        setSort={setSort}
                        align="right"
                      />
                      <SortTh
                        label="Account"
                        field="account"
                        sort={sort}
                        setSort={setSort}
                      />
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r, i) => {
                      const name = r.record?.borrower_name ?? "—";
                      return (
                        <tr
                          key={r.id}
                          className="border-b border-line last:border-0 hover:bg-brand-50/40 dark:border-white/5"
                        >
                          <td className="px-5 py-3.5 text-ink-soft">
                            {(page - 1) * PAGE_SIZE + i + 1}
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="font-semibold">
                              {formatDate(r.payment_date, "dd MMM yyyy")}
                            </p>
                            <p className="text-xs text-ink-soft">
                              {formatDate(r.payment_date, "EEE")}
                            </p>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center gap-2.5">
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success/12 text-xs font-bold text-success">
                                {name.charAt(0).toUpperCase()}
                              </span>
                              <span className="font-medium">{name}</span>
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {formatCurrency(r.principal_amount)}
                          </td>
                          <td className="px-5 py-3.5 text-right text-success">
                            {formatCurrency(r.interest_amount)}
                          </td>
                          <td className="px-5 py-3.5 text-right font-bold">
                            {formatCurrency(r.amount)}
                          </td>
                          <td className="px-5 py-3.5 text-ink-soft">
                            {r.account?.name ?? "—"}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex justify-end">
                              <RowMenu
                                onView={() =>
                                  r.lending_record_id &&
                                  navigate(`/lending/${r.lending_record_id}`)
                                }
                                onDelete={() => setDeleting(r)}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm text-ink-soft dark:border-white/10">
                <span>
                  Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
                  {Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
                  {filtered.length} records
                </span>
                <div className="flex items-center gap-1">
                  <button
                    className="grid h-8 w-8 place-items-center rounded-lg border border-line disabled:opacity-40 dark:border-white/10"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i + 1)}
                      className={`grid h-8 min-w-8 place-items-center rounded-lg border px-2 text-xs font-semibold ${
                        page === i + 1
                          ? "border-brand-700 bg-brand-700 text-white"
                          : "border-line dark:border-white/10"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    className="grid h-8 w-8 place-items-center rounded-lg border border-line disabled:opacity-40 dark:border-white/10"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-success/[0.06] p-3.5 text-sm dark:bg-success/10">
            <InfoDot text="Repaid principal is a return of your own cash — a receivable turning back into cash." />
            <span className="text-ink-soft">
              Principal repayments are not counted as income. Only the interest
              portion increases income.
            </span>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete this repayment?"
        message="Outstanding balances, account cash and any interest income will be reversed."
        confirmLabel="Delete"
        loading={deleteRepayment.isPending}
      />
    </PageContainer>
  );
}
