import {
  ACCOUNT_TYPES,
  isEnabledValue,
  normalizeAccountType
} from "./constants";
import type { Account, BitableRecord, CurrentUser, Person } from "./types";

export type DailyAccountReason =
  | "shared_group_match"
  | "personal_bound_user_match"
  | "personal_bound_name_match"
  | "filtered_disabled"
  | "filtered_personal_not_bound"
  | "filtered_group_mismatch";

export type DailyAccountDiagnostic = {
  recordId: string;
  accountName: string;
  accountType: string;
  group: string;
  boundUserId: string | null;
  boundName: string | null;
  startCredits: number;
  reason: DailyAccountReason;
};

function normalize(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

export function isEnabledAccount(account: Account) {
  return isEnabledValue(account.accountStatus || "");
}

export function isPersonalAccount(account: Account) {
  const type = normalize(account.accountType);
  return (
    account.accountType === ACCOUNT_TYPES.personal ||
    type === "个人账号" ||
    type === "绑定个人" ||
    type === "绑定个人账号" ||
    type.includes("个人")
  );
}

export function isSharedAccount(account: Account) {
  const type = normalize(account.accountType);
  return (
    normalizeAccountType(account.accountType) === ACCOUNT_TYPES.shared ||
    type === "其他" ||
    type.includes("共用")
  );
}

export function classifyDailyAccount(
  user: Pick<Person, "userId" | "name" | "group">,
  record: BitableRecord<Account>
) {
  const account = record.fields;
  let reason: DailyAccountReason = "filtered_group_mismatch";

  if (!isEnabledAccount(account)) {
    reason = "filtered_disabled";
  } else if (isPersonalAccount(account)) {
    if (account.userId && account.userId === user.userId) {
      reason = "personal_bound_user_match";
    } else if (account.animatorName && account.animatorName === user.name) {
      reason = "personal_bound_name_match";
    } else {
      reason = "filtered_personal_not_bound";
    }
  } else if ((isSharedAccount(account) || account.accountType) && account.group === user.group) {
    reason = "shared_group_match";
  }

  return {
    visible:
      reason === "shared_group_match" ||
      reason === "personal_bound_user_match" ||
      reason === "personal_bound_name_match",
    reason,
    diagnostic: dailyAccountDiagnostic(record, reason)
  };
}

export function filterDailyAccountsForUser(
  user: CurrentUser,
  accounts: BitableRecord<Account>[]
) {
  return accounts.filter((record) => classifyDailyAccount(user.person, record).visible);
}

export function buildDailyAccountsDiagnostics(
  user: CurrentUser,
  accounts: BitableRecord<Account>[]
) {
  const visibleAccounts: DailyAccountDiagnostic[] = [];
  const filteredAccounts: DailyAccountDiagnostic[] = [];

  for (const record of accounts) {
    const result = classifyDailyAccount(user.person, record);
    if (result.visible) {
      visibleAccounts.push(result.diagnostic);
    } else {
      filteredAccounts.push(result.diagnostic);
    }
  }

  return {
    userId: user.person.userId,
    name: user.person.name,
    group: user.person.group,
    totalAccounts: accounts.length,
    visibleAccounts,
    filteredAccounts
  };
}

function dailyAccountDiagnostic(
  record: BitableRecord<Account>,
  reason: DailyAccountReason
): DailyAccountDiagnostic {
  const account = record.fields;

  return {
    recordId: record.recordId,
    accountName: account.accountName,
    accountType: account.accountType,
    group: account.group,
    boundUserId: account.userId || null,
    boundName: account.animatorName || null,
    startCredits: account.startCredits,
    reason
  };
}
