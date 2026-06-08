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
  projectGroup?: string;
};

export type ProjectTypeFilter = "all" | "demo" | "正式项目";

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
  return `${account.accountName || "未填写账号"} · ${
    account.accountType || "未填写类型"
  }`;
}

export function selectedAccountIdFromSelectValue(value: string) {
  return value;
}

export function projectTypeDisplayLabel(type: string) {
  if (!type) return "未填写类型";
  return type === "demo" ? "Demo" : type;
}

export function projectOptionLabel(project: {
  name: string;
  type: string;
  group?: string;
}) {
  const group = project.group?.trim();
  const details = group
    ? `${projectTypeDisplayLabel(project.type)} · ${group}`
    : projectTypeDisplayLabel(project.type);
  return `${project.name}（${details}）`;
}

export function projectMatchesTypeFilter(
  project: { type: string },
  filter: ProjectTypeFilter
) {
  return filter === "all" || project.type === filter;
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
