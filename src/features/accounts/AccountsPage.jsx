import { useMemo, useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { PageContainer, EmptyState, ErrorState } from "../../components/common";
import Modal from "../../components/common/Modal";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { useToast } from "../../components/common/ToastProvider";
import { friendlyError } from "../../utils/errors";
import { useProfile } from "../settings/useProfile";
import { useDashboardMetrics } from "../dashboard/useDashboard";
import { useAccounts, useAccountMutations } from "./useAccounts";
import { summarize, isCredit } from "./accountTheme";
import AccountsHero from "./AccountsHero";
import AccountToolbar from "./AccountToolbar";
import AccountCard from "./AccountCard";
import AccountList from "./AccountList";
import AccountSkeleton from "./AccountSkeleton";
import AccountForm from "./AccountForm";
import { useSubscriptionLimits } from "../subscription/hooks/useSubscriptionLimits";
import UpgradeModal from "../subscription/components/UpgradeModal";

const EMPTY = [];

export default function AccountsPage() {
  const {
    data: accounts,
    isLoading,
    isError,
    refetch,
  } = useAccounts({ includeInactive: true });
  const { data: profile } = useProfile();
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics();
  const { remove, recalc, update } = useAccountMutations();
  const toast = useToast();

  const [view, setView] = useState("grid");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const { canCreate } = useSubscriptionLimits();

  const all = accounts ?? EMPTY;
  const summary = useMemo(() => summarize(all), [all]);

  const visible = useMemo(
    () =>
      [...all].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [all],
  );

  const openCreate = () => {
    if (!canCreate("accounts")) {
      setUpgradeOpen(true);
      return;
    }
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (account) => {
    setEditing(account);
    setFormOpen(true);
  };

  const menuProps = {
    onView: openEdit,
    onEdit: openEdit,
    onRefresh: async (account) => {
      if (isCredit(account)) {
        toast.info(
          "Credit card balances are tracked via limit and outstanding — edit them directly.",
        );
        return;
      }
      try {
        await recalc.mutateAsync(account.id);
        toast.success("Balance recalculated from history.");
      } catch (e) {
        toast.error(friendlyError(e));
      }
    },
    onToggleActive: async (account) => {
      try {
        await update.mutateAsync({
          id: account.id,
          is_active: !account.is_active,
        });
        toast.success(
          account.is_active ? "Account deactivated." : "Account activated.",
        );
      } catch (e) {
        toast.error(friendlyError(e));
      }
    },
    onDelete: (account) => setDeleting(account),
  };

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(deleting.id);
      toast.success("Account deleted.");
      setDeleting(null);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <PageContainer
      title="Accounts"
      subtitle="Bank, cash, cards and wallets — your money at a glance."
      action={
        <button className="btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Account
        </button>
      }
    >
      <div className="mb-6">
        <AccountsHero
          metrics={metrics}
          summary={summary}
          loading={isLoading || metricsLoading}
        />
      </div>

      {isError ? (
        <ErrorState message="Unable to load your accounts." onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <AccountSkeleton key={i} />
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add your bank account, card, wallet or cash account to start tracking your money."
          action={
            <button className="btn-primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Account
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          <AccountToolbar view={view} setView={setView} />

          {view === "list" ? (
            <AccountList accounts={visible} menuProps={menuProps} />
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
              {visible.map((a) => (
                <div
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEdit(a)}
                  onKeyDown={(e) => {
                    if (
                      e.target === e.currentTarget &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      openEdit(a);
                    }
                  }}
                  className="cursor-pointer rounded-[18px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50"
                >
                  <AccountCard
                    account={a}
                    cardholderName={profile?.full_name}
                    menuProps={menuProps}
                  />
                </div>
              ))}

              <button
                type="button"
                onClick={openCreate}
                className="group flex aspect-[1.586/1] min-h-[190px] flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-line bg-white/40 text-center transition hover:border-brand-400 hover:bg-brand-50 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-100 text-brand-700 transition group-hover:scale-105 dark:bg-white/10 dark:text-brand-400">
                  <Plus className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold">Add New Account</span>
                <span className="text-xs text-ink-soft">
                  Bank, Card, Wallet or Cash
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit account" : "Add Account"}
        size="lg"
      >
        <AccountForm initial={editing} onDone={() => setFormOpen(false)} />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete this account?"
        message="Your account record will be removed. Transaction history may remain depending on the account relationship."
        confirmLabel="Delete"
        loading={remove.isPending}
      />
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Accounts"
        description="You've reached the Free plan account limit. Upgrade to Pro for unlimited accounts."
      />
    </PageContainer>
  );
}
