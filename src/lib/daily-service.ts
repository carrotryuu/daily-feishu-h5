import {
  DAILY_STATUS,
  DAILY_TYPES,
  ROLES,
  TABLE_FIELDS,
  YES_NO,
  type DailyType,
  type Role
} from "./constants";
import {
  buildDailyAccountsDiagnostics,
  filterDailyAccountsForUser,
  isPersonalAccount,
  isSharedAccount
} from "./account-visibility";
import {
  BitableError,
  createRecord,
  invalidateRecordsCache,
  tableHasField,
  updateRecord
} from "./bitable";
import {
  calculateConsumedCredits,
  defaultDailyDecision
} from "./domain";
import { monthOf, nowIso, sortDateAsc, today, yesterday } from "./dates";
import {
  getAccounts,
  getDailyRecords,
  toDailyFields,
  type RawFields
} from "./records";
import type {
  Account,
  BitableRecord,
  CurrentUser,
  DailyRecord
} from "./types";

const DAILY_SUBMIT_ROLES: Role[] = [ROLES.animator];

type AccountSyncResult =
  | { status: "success"; syncedCurrentRemainingCredits: number }
  | { status: "skipped"; reason: string; missingFields?: string[] }
  | { status: "failed"; reason: string; error: string };

const ACCOUNT_REMAINING_CREDIT_FIELD_CANDIDATES = [
  TABLE_FIELDS.accounts.currentRemainingCredits,
  "剩余积分",
  "今日剩余积分",
  "最近剩余积分"
];

export type DailySubmitInput = {
  date?: string;
  dateMode: "today" | "yesterday";
  reportType?: DailyType;
  dailyType?: DailyType;
  accountRecordId?: string;
  accountName?: string;
  isAccountChanged?: boolean;
  changedAccount: boolean;
  remainingCredits: number;
  assetCount: number;
  videoDurationSeconds?: number;
  roughCutSeconds: number;
  hasGenerationIssue?: boolean;
  hasIssue: boolean;
  issueDescription?: string;
  issueNote?: string;
  workNote?: string;
  note?: string;
  summary?: string;
  nonProductionNote?: string;
};

export async function getDailyPageData(user: CurrentUser) {
  assertCanUseDaily(user, "填写日报");
  assertUserGroup(user);

  const [accounts, daily] = await Promise.all([getAccounts(), getDailyRecords()]);
  const usableAccounts = filterDailyAccountsForUser(user, accounts);

  console.info("[Daily available accounts]", buildDailyAccountsDiagnostics(user, accounts));

  return {
    user: user.person,
    today: today(),
    yesterday: yesterday(),
    accounts: usableAccounts.map((record) => ({
      ...record.fields,
      recordId: record.recordId
    })),
    recentDaily: daily
      .filter((record) => record.fields.userId === user.person.userId)
      .sort((a, b) => sortDateAsc(b.fields.date, a.fields.date))
      .slice(0, 20)
      .map((record) => ({
        ...record.fields,
        recordId: record.recordId,
        consumedCredits:
          record.fields.consumedCredits ??
          calculateConsumedCredits({
            changedAccount: record.fields.changedAccount === YES_NO.yes,
            previousCredits: record.fields.previousCredits,
            newAccountStartCredits: record.fields.newAccountStartCredits,
            remainingCredits: record.fields.remainingCredits
          })
      }))
  };
}

export async function submitDaily(user: CurrentUser, input: DailySubmitInput) {
  assertCanUseDaily(user, "提交日报", input);
  assertUserGroup(user, input);

  const date = resolveDate(input);
  const dailyType = resolveDailyType(input.reportType || input.dailyType);
  const isProduction = dailyType === DAILY_TYPES.production;
  const [accounts, daily] = await Promise.all([getAccounts(), getDailyRecords()]);
  const usableAccounts = filterDailyAccountsForUser(user, accounts);
  const changedAccount = input.isAccountChanged ?? input.changedAccount;
  const roughCutSeconds = input.videoDurationSeconds ?? input.roughCutSeconds;
  const hasIssue = input.hasGenerationIssue ?? input.hasIssue;
  const issueNote = input.issueDescription ?? input.issueNote ?? "";

  if (!isProduction) {
    const nonProductionNote = (
      input.workNote ||
      input.note ||
      input.summary ||
      input.nonProductionNote ||
      ""
    ).trim();
    if (!nonProductionNote) {
      throw new Response("非生产日报必须填写非生产说明", { status: 400 });
    }

    const record: DailyRecord = {
      dailyType,
      date,
      userId: user.person.userId,
      name: user.person.name,
      group: user.person.group,
      changedAccount: YES_NO.no,
      account: "",
      platform: "",
      accountType: "",
      previousCredits: 0,
      newAccountStartCredits: 0,
      remainingCredits: 0,
      consumedCredits: 0,
      assetCount: 0,
      roughCutSeconds: 0,
      hasIssue: YES_NO.no,
      issueNote: "",
      nonProductionNote,
      status: DAILY_STATUS.pending,
      includeRanking: YES_NO.no,
      month: monthOf(date),
      submittedAt: nowIso()
    };

    const created = await createDailyRecord(record);
    return {
      recordId: created.recordId,
      daily: record,
      accountSync: {
        status: "skipped",
        reason: "non_production_daily"
      } satisfies AccountSyncResult
    };
  }

  if (!input.accountRecordId) {
    throw new Response("生产日报必须选择账号", { status: 400 });
  }

  const accountRecord = resolveUsableAccountRecord(
    user,
    input,
    accounts,
    usableAccounts
  );
  const account = accountRecord?.fields;

  if (!account) {
    throw accountForbiddenResponse(user, input, accounts);
  }

  const duplicated = daily.some(
    (record) =>
      record.fields.userId === user.person.userId &&
      record.fields.date === date &&
      record.fields.account === account.accountName
  );
  if (duplicated) {
    throw new Response("同一天同一账号已经提交过日报", { status: 409 });
  }

  const previousCredits = findPreviousCredits(
    daily,
    account,
    date,
    accountRecord.recordId
  );
  const newAccountStartCredits = changedAccount ? account.startCredits : 0;
  const consumedCredits = calculateConsumedCredits({
    changedAccount,
    previousCredits,
    newAccountStartCredits,
    remainingCredits: input.remainingCredits
  });
  const decision = defaultDailyDecision({
    consumedCredits,
    accountType: account.accountType,
    dailyType,
    date
  });

  const record = buildProductionDailyRecord({
    user,
    accountRecordId: accountRecord.recordId,
    account,
    dailyType,
    date,
    changedAccount,
    previousCredits,
    newAccountStartCredits,
    remainingCredits: input.remainingCredits,
    consumedCredits,
    assetCount: input.assetCount,
    roughCutSeconds,
    hasIssue,
    issueNote,
    includeRanking: decision.includeRanking
  });

  const created = await createDailyRecord(record);
  const accountSync = await syncAccountAfterDailySubmit({
    user,
    account,
    accountRecordId: accountRecord.recordId,
    accountName: account.accountName,
    accountType: account.accountType,
    dailyRecordId: created.recordId,
    remainingCredits: input.remainingCredits,
    date,
    sameDayDaily: [
      ...daily,
      {
        recordId: created.recordId,
        fields: record
      }
    ]
  });

  return {
    recordId: created.recordId,
    daily: record,
    accountSync,
    ...(accountSync.status === "failed" || accountSync.status === "skipped"
      ? { warning: accountSync }
      : {})
  };
}

export function buildProductionDailyRecord(input: {
  user: CurrentUser;
  accountRecordId: string;
  account: Account;
  dailyType: DailyType;
  date: string;
  changedAccount: boolean;
  previousCredits: number;
  newAccountStartCredits: number;
  remainingCredits: number;
  consumedCredits: number;
  assetCount: number;
  roughCutSeconds: number;
  hasIssue: boolean;
  issueNote: string;
  includeRanking: boolean;
}): DailyRecord {
  return {
    dailyType: input.dailyType,
    accountRecordId: input.accountRecordId,
    date: input.date,
    userId: input.user.person.userId,
    name: input.user.person.name,
    group: input.user.person.group,
    changedAccount: input.changedAccount ? YES_NO.yes : YES_NO.no,
    account: input.account.accountName,
    platform: input.account.platform,
    accountType: input.account.accountType,
    previousCredits: input.previousCredits,
    newAccountStartCredits: input.changedAccount ? input.newAccountStartCredits : 0,
    remainingCredits: input.remainingCredits,
    consumedCredits: input.consumedCredits,
    assetCount: input.assetCount,
    roughCutSeconds: input.roughCutSeconds,
    hasIssue: input.hasIssue ? YES_NO.yes : YES_NO.no,
    issueNote: input.issueNote,
    nonProductionNote: "",
    status: DAILY_STATUS.pending,
    includeRanking: input.includeRanking ? YES_NO.yes : YES_NO.no,
    month: monthOf(input.date),
    submittedAt: nowIso()
  };
}

function assertCanUseDaily(
  user: CurrentUser,
  action: string,
  input?: Partial<DailySubmitInput>
) {
  if (!DAILY_SUBMIT_ROLES.includes(user.person.role)) {
    throw forbiddenResponse("当前角色无权提交日报", user, input);
  }
}

function assertUserGroup(user: CurrentUser, input?: Partial<DailySubmitInput>) {
  if (!user.person.group) {
    throw forbiddenResponse("当前用户缺少小组信息，无法提交日报", user, input);
  }
}

function forbiddenResponse(
  reason: string,
  user: CurrentUser,
  input?: Partial<DailySubmitInput>
) {
  return new Response(
    JSON.stringify({
      error: "FORBIDDEN",
      reason,
      debug: dailyDebug(user, input)
    }),
    {
      status: 403,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    }
  );
}

function dailyDebug(user: CurrentUser, input?: Partial<DailySubmitInput>) {
  return {
    userId: user.person.userId,
    role: user.person.role,
    enabled: user.person.enabled,
    group: user.person.group,
    reportType: input?.reportType || input?.dailyType || null,
    accountRecordId: input?.accountRecordId || null,
    allowedRoles: DAILY_SUBMIT_ROLES
  };
}

function accountForbiddenResponse(
  user: CurrentUser,
  input: DailySubmitInput,
  accounts: BitableRecord<Account>[]
) {
  const accountRecord = accounts.find(
    (record) => record.recordId === input.accountRecordId
  );
  const account = accountRecord?.fields;

  return new Response(
    JSON.stringify({
      error: "ACCOUNT_FORBIDDEN",
      reason: "账号不属于当前用户/小组或未启用",
      debug: {
        accountRecordId: input.accountRecordId || null,
        accountGroup: account?.group || null,
        userGroup: user.person.group,
        accountType: account?.accountType || null,
        boundAnimator: account?.userId || account?.animatorName || null,
        currentUserId: user.person.userId,
        accountStatus: account?.accountStatus || null
      }
    }),
    {
      status: 403,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    }
  );
}

function resolveDate(input: DailySubmitInput) {
  if (input.date) return input.date;
  return input.dateMode === "today" ? today() : yesterday();
}

function resolveUsableAccountRecord(
  user: CurrentUser,
  input: DailySubmitInput,
  accounts: BitableRecord<Account>[],
  usableAccounts: BitableRecord<Account>[]
) {
  const matched = accounts.find((record) => record.recordId === input.accountRecordId);
  if (!matched) return undefined;
  return usableAccounts.find((record) => record.recordId === matched.recordId);
}

async function createDailyRecord(record: DailyRecord) {
  const fields = toDailyFields(record);
  const f = TABLE_FIELDS.daily;

  if (
    record.accountRecordId &&
    !(await tableHasField("daily", f.accountRecordId))
  ) {
    console.info("[Daily accountRecordId field missing, fallback to account name]");
  }

  console.info("[Daily fields to write]", {
    table: "daily",
    fields: Object.keys(fields)
  });

  try {
    return await createRecord("daily", fields);
  } catch (error) {
    if (error instanceof BitableError) {
      console.error("[Daily submit write failed]", {
        table: "daily",
        status: error.status,
        code: error.code,
        message: error.feishuMessage || error.message,
        path: error.path,
        fields: Object.keys(fields)
      });

      throw new Response(
        JSON.stringify({
          error: "BITABLE_WRITE_FAILED",
          reason: "飞书写入失败",
          feishuError: {
            status: error.status,
            code: error.code,
            message: error.feishuMessage || error.message,
            path: error.path
          }
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        }
      );
    }
    throw error;
  }
}

async function syncAccountAfterDailySubmit(input: {
  user: CurrentUser;
  account: Account;
  accountRecordId: string;
  accountName: string;
  accountType: Account["accountType"];
  dailyRecordId: string;
  remainingCredits: number;
  date: string;
  sameDayDaily: BitableRecord<DailyRecord>[];
}): Promise<AccountSyncResult> {
  const fieldMap = await resolveAccountSyncFields();
  const missingFields = accountSyncMissingFields(fieldMap);
  const syncedCurrentRemainingCredits = resolveSyncedCurrentRemainingCredits(input);

  if (missingFields.length > 0) {
    const result: AccountSyncResult = {
      status: "skipped",
      reason: "缺少平台账号表字段",
      missingFields
    };
    logAccountSync({
      ...input,
      syncedCurrentRemainingCredits,
      status: result.status,
      reason: "ACCOUNT_SYNC_SKIPPED",
      missingFields
    });
    await invalidateRecordsCache("accounts");
    return result;
  }

  const fields: RawFields = {
    [fieldMap.currentRemainingCredits!]: syncedCurrentRemainingCredits,
    [fieldMap.lastUseDate!]: dateToMs(input.date),
    [fieldMap.lastUser!]: input.user.person.name,
    [fieldMap.lastDailyId!]: input.dailyRecordId
  };

  try {
    await updateRecord<RawFields>("accounts", input.accountRecordId, fields);
    const result: AccountSyncResult = {
      status: "success",
      syncedCurrentRemainingCredits
    };
    logAccountSync({
      ...input,
      syncedCurrentRemainingCredits,
      status: result.status
    });
    return result;
  } catch (error) {
    const result: AccountSyncResult = {
      status: "failed",
      reason: "ACCOUNT_SYNC_FAILED",
      error: accountSyncErrorMessage(error)
    };
    logAccountSync({
      ...input,
      syncedCurrentRemainingCredits,
      status: result.status,
      reason: result.reason
    });
    console.error("[ACCOUNT_SYNC_FAILED]", {
      accountRecordId: input.accountRecordId,
      dailyRecordId: input.dailyRecordId,
      error: result.error
    });
    await invalidateRecordsCache("accounts");
    return result;
  }
}

async function resolveAccountSyncFields() {
  const currentRemainingCredits = await firstExistingAccountField(
    ACCOUNT_REMAINING_CREDIT_FIELD_CANDIDATES
  );

  return {
    currentRemainingCredits,
    lastUseDate: (await tableHasField(
      "accounts",
      TABLE_FIELDS.accounts.lastUseDate
    ))
      ? TABLE_FIELDS.accounts.lastUseDate
      : undefined,
    lastUser: (await tableHasField("accounts", TABLE_FIELDS.accounts.lastUser))
      ? TABLE_FIELDS.accounts.lastUser
      : undefined,
    lastDailyId: (await tableHasField(
      "accounts",
      TABLE_FIELDS.accounts.lastDailyId
    ))
      ? TABLE_FIELDS.accounts.lastDailyId
      : undefined
  };
}

async function firstExistingAccountField(candidates: string[]) {
  for (const fieldName of candidates) {
    if (await tableHasField("accounts", fieldName)) return fieldName;
  }
  return undefined;
}

function accountSyncMissingFields(fieldMap: {
  currentRemainingCredits?: string;
  lastUseDate?: string;
  lastUser?: string;
  lastDailyId?: string;
}) {
  const missing: string[] = [];
  if (!fieldMap.currentRemainingCredits) {
    missing.push(TABLE_FIELDS.accounts.currentRemainingCredits);
  }
  if (!fieldMap.lastUseDate) missing.push(TABLE_FIELDS.accounts.lastUseDate);
  if (!fieldMap.lastUser) missing.push(TABLE_FIELDS.accounts.lastUser);
  if (!fieldMap.lastDailyId) missing.push(TABLE_FIELDS.accounts.lastDailyId);
  return missing;
}

function accountSyncErrorMessage(error: unknown) {
  if (error instanceof BitableError) {
    return error.feishuMessage || error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function resolveSyncedCurrentRemainingCredits(input: {
  account: Account;
  accountRecordId: string;
  accountName: string;
  date: string;
  remainingCredits: number;
  sameDayDaily: BitableRecord<DailyRecord>[];
}) {
  if (!isSharedAccount(input.account)) return input.remainingCredits;

  const sameDayRecords = input.sameDayDaily.filter((record) => {
    if (record.fields.dailyType !== DAILY_TYPES.production) return false;
    if (record.fields.date !== input.date) return false;
    if (record.fields.accountRecordId) {
      return record.fields.accountRecordId === input.accountRecordId;
    }
    return record.fields.account === input.accountName;
  });
  const remainingValues = sameDayRecords
    .map((record) => record.fields.remainingCredits)
    .filter((value) => Number.isFinite(value));
  const minRemainingCredits = remainingValues.length
    ? Math.min(...remainingValues)
    : input.remainingCredits;

  console.info("[Shared account daily min remaining resolved]", {
    accountRecordId: input.accountRecordId,
    accountName: input.accountName,
    date: input.date,
    sameDayRecordCount: sameDayRecords.length,
    minRemainingCredits,
    recordIds: sameDayRecords.map((record) => record.recordId)
  });

  return minRemainingCredits;
}

function dateToMs(value: string) {
  return new Date(`${value}T00:00:00+08:00`).getTime();
}

function logAccountSync(input: {
  accountRecordId: string;
  accountName: string;
  accountType: Account["accountType"];
  dailyRecordId: string;
  remainingCredits: number;
  syncedCurrentRemainingCredits?: number;
  date: string;
  user: CurrentUser;
  status: AccountSyncResult["status"];
  reason?: string;
  missingFields?: string[];
}) {
  console.info("[Account sync after daily submit]", {
    accountRecordId: input.accountRecordId,
    accountName: input.accountName,
    accountType: input.accountType,
    dailyRecordId: input.dailyRecordId,
    remainingCredits: input.remainingCredits,
    syncedCurrentRemainingCredits: input.syncedCurrentRemainingCredits,
    date: input.date,
    userId: input.user.person.userId,
    name: input.user.person.name,
    status: input.status,
    reason: input.reason,
    missingFields: input.missingFields
  });
}

function resolveDailyType(value?: string): DailyType {
  const allowedTypes = Object.values(DAILY_TYPES) as string[];
  if (!value) return DAILY_TYPES.production;
  if (allowedTypes.includes(value)) return value as DailyType;
  throw new Response("日报类型不正确", { status: 400 });
}

export function findPreviousCredits(
  daily: BitableRecord<DailyRecord>[],
  account: Account,
  targetDate: string,
  accountRecordId?: string
) {
  if (
    (isPersonalAccount(account) || isSharedAccount(account)) &&
    account.currentRemainingCredits !== undefined
  ) {
    return account.currentRemainingCredits;
  }

  if (isSharedAccount(account)) {
    return account.startCredits;
  }

  const candidates = daily.filter(
    (record) =>
      isEffectivePreviousDaily(record.fields) &&
      sortDateAsc(record.fields.date, targetDate) < 0
  );
  const recordIdMatched = accountRecordId
    ? candidates.filter((record) => record.fields.accountRecordId === accountRecordId)
    : [];
  const accountMatched = recordIdMatched.length
    ? recordIdMatched
    : candidates.filter((record) => record.fields.account === account.accountName);
  const previous = accountMatched
    .sort((a, b) => sortDateAsc(b.fields.date, a.fields.date))[0];

  return previous?.fields.remainingCredits ?? account.startCredits;
}

function isEffectivePreviousDaily(record: DailyRecord) {
  return (
    record.status !== DAILY_STATUS.rejected &&
    record.status !== DAILY_STATUS.abnormal
  );
}

export function dailyListFieldsForClient(record: DailyRecord) {
  return {
    [TABLE_FIELDS.daily.date]: record.date,
    [TABLE_FIELDS.daily.name]: record.name,
    [TABLE_FIELDS.daily.account]: record.account,
    [TABLE_FIELDS.daily.status]: record.status || DAILY_STATUS.pending
  };
}
