import {
  ACCOUNT_TYPES,
  DAILY_STATUS,
  DAILY_TYPES,
  ROLES,
  TABLE_FIELDS,
  YES_NO,
  type DailyType,
  type Role
} from "./constants";
import { BitableError, createRecord } from "./bitable";
import {
  calculateConsumedCredits,
  defaultDailyDecision
} from "./domain";
import { monthOf, nowIso, sortDateAsc, today, yesterday } from "./dates";
import {
  enabledAccounts,
  getAccounts,
  getDailyRecords,
  toDailyFields
} from "./records";
import type {
  Account,
  BitableRecord,
  CurrentUser,
  DailyRecord
} from "./types";

const DAILY_SUBMIT_ROLES: Role[] = [ROLES.animator];

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
  const usableAccounts = filterUsableAccounts(user, enabledAccounts(accounts));

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
  const usableAccounts = filterUsableAccounts(user, enabledAccounts(accounts));
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
      daily: record
    };
  }

  if (!input.accountRecordId && !input.accountName) {
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

  const previousCredits = findPreviousCredits(daily, account, date);
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

  const record: DailyRecord = {
    dailyType,
    date,
    userId: user.person.userId,
    name: user.person.name,
    group: user.person.group,
    changedAccount: changedAccount ? YES_NO.yes : YES_NO.no,
    account: account.accountName,
    platform: account.platform,
    accountType: account.accountType,
    previousCredits,
    newAccountStartCredits,
    remainingCredits: input.remainingCredits,
    consumedCredits,
    assetCount: input.assetCount,
    roughCutSeconds,
    hasIssue: hasIssue ? YES_NO.yes : YES_NO.no,
    issueNote,
    nonProductionNote: "",
    status: decision.status,
    includeRanking: decision.includeRanking ? YES_NO.yes : YES_NO.no,
    month: monthOf(date),
    submittedAt: nowIso()
  };

  const created = await createDailyRecord(record);
  return {
    recordId: created.recordId,
    daily: record
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
  const accountRecord = accounts.find((record) =>
    input.accountRecordId
      ? record.recordId === input.accountRecordId
      : record.fields.accountName === input.accountName
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
  const matched = accounts.find((record) =>
    input.accountRecordId
      ? record.recordId === input.accountRecordId
      : record.fields.accountName === input.accountName
  );
  if (!matched) return undefined;
  return usableAccounts.find((record) => record.recordId === matched.recordId);
}

async function createDailyRecord(record: DailyRecord) {
  const fields = toDailyFields(record);

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

function resolveDailyType(value?: string): DailyType {
  const allowedTypes = Object.values(DAILY_TYPES) as string[];
  if (!value) return DAILY_TYPES.production;
  if (allowedTypes.includes(value)) return value as DailyType;
  throw new Response("日报类型不正确", { status: 400 });
}

function filterUsableAccounts(
  user: CurrentUser,
  accounts: BitableRecord<Account>[]
) {
  return accounts.filter((record) => {
    const account = record.fields;
    if (account.group !== user.person.group) return false;
    if (account.accountType === ACCOUNT_TYPES.personal) {
      return account.userId === user.person.userId;
    }
    return true;
  });
}

function findPreviousCredits(
  daily: BitableRecord<DailyRecord>[],
  account: Account,
  targetDate: string
) {
  const previous = daily
    .filter(
      (record) =>
        record.fields.account === account.accountName &&
        sortDateAsc(record.fields.date, targetDate) < 0
    )
    .sort((a, b) => sortDateAsc(b.fields.date, a.fields.date))[0];

  return previous?.fields.remainingCredits ?? account.startCredits;
}

export function dailyListFieldsForClient(record: DailyRecord) {
  return {
    [TABLE_FIELDS.daily.date]: record.date,
    [TABLE_FIELDS.daily.name]: record.name,
    [TABLE_FIELDS.daily.account]: record.account,
    [TABLE_FIELDS.daily.status]: record.status || DAILY_STATUS.pending
  };
}
