import { isProductionDaily } from "./daily-form";

export type SuccessDialog = {
  title: string;
  content: string;
  warning?: string;
};

export const ACCOUNT_SYNC_WARNING =
  "账号状态同步未完成，请联系管理员检查账号表字段。";

export function buildDailySuccessDialog(
  dailyType: string,
  payload: Record<string, unknown>
): SuccessDialog {
  return {
    title: "提交成功",
    content: isProductionDaily(dailyType)
      ? "生产日报已提交，等待导演审核。"
      : "日报已提交，等待导演审核。",
    warning: hasAccountSyncWarning(payload) ? ACCOUNT_SYNC_WARNING : undefined
  };
}

export function buildReviewSuccessDialog(): SuccessDialog {
  return {
    title: "审核提交成功",
    content: "审核结果已保存。"
  };
}

export function hasAccountSyncWarning(payload: Record<string, unknown>) {
  const warning = payload.warning;
  if (isSyncWarningStatus(warning)) return true;

  const accountSync = payload.accountSync;
  if (!accountSync || typeof accountSync !== "object" || Array.isArray(accountSync)) {
    return false;
  }

  const status = (accountSync as Record<string, unknown>).status;
  const reason = (accountSync as Record<string, unknown>).reason;
  return (
    (status === "skipped" || status === "failed") &&
    reason !== "non_production_daily"
  );
}

function isSyncWarningStatus(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const status = (value as Record<string, unknown>).status;
  return status === "skipped" || status === "failed";
}
