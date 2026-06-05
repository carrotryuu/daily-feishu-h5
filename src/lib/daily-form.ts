export type DailyFormAccount = {
  recordId: string;
  accountName: string;
  platform: string;
  accountType: string;
  startCredits: number;
};

export type DailySubmitForm = {
  dateMode: string;
  dailyType: string;
  selectedAccountId: string;
  changedAccount: boolean;
  remainingCredits: string;
  assetCount: string;
  roughCutSeconds: string;
  hasIssue: boolean;
  issueNote: string;
  nonProductionNote: string;
  selectedProjectName?: string;
  projectType?: string;
};

export function isProductionDaily(dailyType: string) {
  return dailyType === "生产日报";
}

export function resolveSelectedAccountId(
  currentAccountId: string,
  accounts: DailyFormAccount[]
) {
  if (accounts.some((account) => account.recordId === currentAccountId)) {
    return currentAccountId;
  }
  return accounts.length === 1 ? accounts[0].recordId : "";
}

export function findSelectedAccount(
  accounts: DailyFormAccount[],
  selectedAccountId: string
) {
  return accounts.find((account) => account.recordId === selectedAccountId);
}

export function selectedAccountStartCredits(
  accounts: DailyFormAccount[],
  selectedAccountId: string
) {
  return findSelectedAccount(accounts, selectedAccountId)?.startCredits;
}

export function accountSelectOptionValue(account: DailyFormAccount) {
  return account.recordId;
}

export function accountSelectOptionLabel(account: DailyFormAccount) {
  return `${account.accountName} · ${account.accountType}`;
}

export function selectedAccountIdFromSelectValue(value: string) {
  return value;
}

export function canSubmitDailyForm(
  form: Pick<DailySubmitForm, "dailyType" | "selectedAccountId">,
  accounts: DailyFormAccount[]
) {
  if (!isProductionDaily(form.dailyType)) return true;
  return Boolean(findSelectedAccount(accounts, form.selectedAccountId));
}

export function buildDailySubmitPayload(
  form: DailySubmitForm,
  selectedDate?: string
) {
  const isProduction = isProductionDaily(form.dailyType);
  const issueNote = form.hasIssue ? form.issueNote : "";

  return {
    date: selectedDate,
    reportType: form.dailyType,
    dateMode: form.dateMode,
    dailyType: form.dailyType,
    accountRecordId: isProduction ? form.selectedAccountId || undefined : undefined,
    isAccountChanged: form.changedAccount,
    changedAccount: form.changedAccount,
    remainingCredits: Number(form.remainingCredits),
    assetCount: Number(form.assetCount),
    videoDurationSeconds: Number(form.roughCutSeconds),
    roughCutSeconds: Number(form.roughCutSeconds),
    hasGenerationIssue: form.hasIssue,
    hasIssue: form.hasIssue,
    issueDescription: issueNote,
    issueNote,
    workNote: form.nonProductionNote,
    note: form.nonProductionNote,
    summary: form.nonProductionNote,
    nonProductionNote: form.nonProductionNote,
    projectName: form.selectedProjectName || "",
    projectType: form.projectType || ""
  };
}
