import {
  ACCOUNT_TYPES,
  DAILY_STATUS,
  DAILY_TYPES,
  ROLES,
  TABLE_FIELDS,
  YES_NO,
  type DailyType
} from "./constants";
import { createRecord } from "./bitable";
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
import type { Account, BitableRecord, CurrentUser, DailyRecord } from "./types";

export type DailySubmitInput = {
  dateMode: "today" | "yesterday";
  dailyType?: DailyType;
  accountRecordId?: string;
  accountName?: string;
  changedAccount: boolean;
  remainingCredits: number;
  assetCount: number;
  roughCutSeconds: number;
  hasIssue: boolean;
  issueNote?: string;
  nonProductionNote?: string;
};

export async function getDailyPageData(user: CurrentUser) {
  if (user.person.role !== ROLES.animator) {
    throw new Response("只有动画师可以填写日报", { status: 403 });
  }

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
  if (user.person.role !== ROLES.animator) {
    throw new Response("只有动画师可以提交日报", { status: 403 });
  }

  const date = input.dateMode === "today" ? today() : yesterday();
  const dailyType = resolveDailyType(input.dailyType);
  const isProduction = dailyType === DAILY_TYPES.production;
  const [accounts, daily] = await Promise.all([getAccounts(), getDailyRecords()]);
  const usableAccounts = filterUsableAccounts(user, enabledAccounts(accounts));

  if (!isProduction) {
    const nonProductionNote = (input.nonProductionNote || "").trim();
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

    const created = await createRecord("daily", toDailyFields(record));
    return {
      recordId: created.recordId,
      daily: record
    };
  }

  const accountRecord = usableAccounts.find((record) =>
    input.accountRecordId
      ? record.recordId === input.accountRecordId
      : record.fields.accountName === input.accountName
  );
  const account = accountRecord?.fields;

  if (!account) {
    throw new Response("账号不可用或不属于当前动画师", { status: 400 });
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
  const newAccountStartCredits = input.changedAccount ? account.startCredits : 0;
  const consumedCredits = calculateConsumedCredits({
    changedAccount: input.changedAccount,
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
    changedAccount: input.changedAccount ? YES_NO.yes : YES_NO.no,
    account: account.accountName,
    platform: account.platform,
    accountType: account.accountType,
    previousCredits,
    newAccountStartCredits,
    remainingCredits: input.remainingCredits,
    consumedCredits,
    assetCount: input.assetCount,
    roughCutSeconds: input.roughCutSeconds,
    hasIssue: input.hasIssue ? YES_NO.yes : YES_NO.no,
    issueNote: input.issueNote || "",
    nonProductionNote: "",
    status: decision.status,
    includeRanking: decision.includeRanking ? YES_NO.yes : YES_NO.no,
    month: monthOf(date),
    submittedAt: nowIso()
  };

  const created = await createRecord("daily", toDailyFields(record));
  return {
    recordId: created.recordId,
    daily: record
  };
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
    if (account.accountType === ACCOUNT_TYPES.shared) return true;
    return account.userId === user.person.userId;
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
