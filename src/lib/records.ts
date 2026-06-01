import {
  ACCOUNT_STATUS,
  DAILY_TYPES,
  ROLES,
  TABLE_FIELDS,
  YES_NO,
  isEnabledValue,
  isPlatformOption,
  normalizeEnabled,
  normalizeRole,
  type ReviewGrade
} from "./constants";
import { listRecords } from "./bitable";
import { formatDate } from "./dates";
import type {
  Account,
  BitableRecord,
  DailyRecord,
  Person,
  PushLogRecord,
  RankingRecord,
  ReviewRecord
} from "./types";

export type RawFields = Record<string, unknown>;

function text(value: unknown) {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "object" && item && "text" in item
          ? String(item.text)
          : String(item)
      )
      .join("");
  }
  return String(value);
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown) {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function date(value: unknown) {
  if (typeof value === "number") return formatDate(new Date(value));
  return text(value).slice(0, 10);
}

function dateTime(value: unknown) {
  if (typeof value === "number") return new Date(value).toISOString();
  return text(value);
}

function firstText(fields: RawFields, names: string[]) {
  for (const name of names) {
    const value = text(fields[name]);
    if (value) return value;
  }
  return "";
}

function dateToMs(value: string) {
  return new Date(`${value}T00:00:00+08:00`).getTime();
}

function dateTimeToMs(value: string) {
  return new Date(value).getTime();
}

export function mapPerson(fields: RawFields): Person {
  const f = TABLE_FIELDS.people;
  return {
    userId: text(fields[f.userId]),
    name: text(fields[f.name]),
    role: normalizeRole(text(fields[f.role])),
    group: firstText(fields, [f.group, "小组", "组别"]),
    enabled: normalizeEnabled(text(fields[f.enabled])),
    remark: text(fields[f.remark])
  };
}

export function mapAccount(fields: RawFields): Account {
  const f = TABLE_FIELDS.accounts;
  const platform = text(fields[f.platform]);
  return {
    accountId: text(fields[f.accountId]),
    group: text(fields[f.group]),
    platform: isPlatformOption(platform) ? platform : "其他",
    accountName: text(fields[f.accountName]),
    accountType: text(fields[f.accountType]) as Account["accountType"],
    accountStatus: text(fields[f.accountStatus]) as Account["accountStatus"],
    animatorName: text(fields[f.animatorName]),
    userId: text(fields[f.userId]),
    startCredits: number(fields[f.startCredits]),
    remark: text(fields[f.remark])
  };
}

export function mapDaily(fields: RawFields): DailyRecord {
  const f = TABLE_FIELDS.daily;
  return {
    dailyId: text(fields[f.dailyId]),
    dailyType: (text(fields[f.dailyType]) ||
      DAILY_TYPES.production) as DailyRecord["dailyType"],
    date: date(fields[f.date]),
    userId: text(fields[f.userId]),
    name: text(fields[f.name]),
    group: text(fields[f.group]),
    changedAccount: text(fields[f.changedAccount]) as DailyRecord["changedAccount"],
    account: text(fields[f.account]),
    platform: text(fields[f.platform]),
    accountType: text(fields[f.accountType]) as DailyRecord["accountType"],
    previousCredits: number(fields[f.previousCredits]),
    newAccountStartCredits: number(fields[f.newAccountStartCredits]),
    remainingCredits: number(fields[f.remainingCredits]),
    consumedCredits: optionalNumber(fields[f.consumedCredits]),
    assetCount: number(fields[f.assetCount]),
    roughCutSeconds: number(fields[f.roughCutSeconds]),
    hasIssue: text(fields[f.hasIssue]) as DailyRecord["hasIssue"],
    issueNote: text(fields[f.issueNote]),
    nonProductionNote: text(fields[f.nonProductionNote]),
    status: text(fields[f.status]) as DailyRecord["status"],
    includeRanking: text(fields[f.includeRanking]) as DailyRecord["includeRanking"],
    month: text(fields[f.month]),
    submittedAt: dateTime(fields[f.submittedAt])
  };
}

export function mapReview(fields: RawFields): ReviewRecord {
  const f = TABLE_FIELDS.reviews;
  return {
    reviewId: text(fields[f.reviewId]),
    dailyId: text(fields[f.dailyId]),
    date: date(fields[f.date]),
    name: text(fields[f.name]),
    userId: text(fields[f.userId]),
    group: text(fields[f.group]),
    reviewerUserId: text(fields[f.reviewerUserId]),
    reviewerName: text(fields[f.reviewerName]),
    grade: text(fields[f.grade]).replaceAll(" ", "") as ReviewGrade,
    weight: number(fields[f.weight]),
    roughCutSeconds: number(fields[f.roughCutSeconds]),
    weightedRoughCutSeconds: number(fields[f.weightedRoughCutSeconds]),
    note: text(fields[f.note]),
    status: "已审核",
    reviewedAt: dateTime(fields[f.reviewedAt]),
    month: text(fields[f.month])
  };
}

export function mapRanking(fields: RawFields): RankingRecord {
  const f = TABLE_FIELDS.rankings;
  return {
    month: text(fields[f.month]),
    rank: number(fields[f.rank]),
    animatorName: text(fields[f.animatorName]),
    group: text(fields[f.group]),
    roughCutSeconds: number(fields[f.roughCutSeconds]),
    weightedRoughCutSeconds: number(fields[f.weightedRoughCutSeconds]),
    averageWeight: number(fields[f.averageWeight]),
    updatedAt: dateTime(fields[f.updatedAt])
  };
}

export function toDailyFields(record: DailyRecord): RawFields {
  const f = TABLE_FIELDS.daily;
  return {
    [f.dailyType]: record.dailyType,
    [f.date]: dateToMs(record.date),
    [f.userId]: record.userId,
    [f.name]: record.name,
    [f.group]: record.group,
    [f.changedAccount]: record.changedAccount,
    [f.account]: record.account,
    [f.platform]: record.platform,
    [f.accountType]: record.accountType,
    [f.previousCredits]: record.previousCredits,
    [f.newAccountStartCredits]: record.newAccountStartCredits,
    [f.remainingCredits]: record.remainingCredits,
    [f.consumedCredits]: record.consumedCredits ?? 0,
    [f.assetCount]: record.assetCount,
    [f.roughCutSeconds]: record.roughCutSeconds,
    [f.hasIssue]: record.hasIssue,
    [f.issueNote]: record.issueNote || "",
    [f.nonProductionNote]: record.nonProductionNote || "",
    [f.status]: record.status,
    [f.includeRanking]: record.includeRanking,
    [f.month]: record.month,
    [f.submittedAt]: dateTimeToMs(record.submittedAt)
  };
}

export function toReviewFields(record: ReviewRecord): RawFields {
  const f = TABLE_FIELDS.reviews;
  return {
    [f.dailyId]: record.dailyId,
    [f.date]: dateToMs(record.date),
    [f.name]: record.name,
    [f.userId]: record.userId,
    [f.group]: record.group,
    [f.reviewerUserId]: record.reviewerUserId,
    [f.reviewerName]: record.reviewerName,
    [f.grade]: record.grade,
    [f.roughCutSeconds]: record.roughCutSeconds,
    [f.note]: record.note || "",
    [f.status]: record.status,
    [f.reviewedAt]: dateTimeToMs(record.reviewedAt),
    [f.month]: record.month
  };
}

export function toAccountFields(record: Partial<Account>): RawFields {
  const f = TABLE_FIELDS.accounts;
  return {
    ...(record.group !== undefined ? { [f.group]: record.group } : {}),
    ...(record.platform !== undefined ? { [f.platform]: record.platform } : {}),
    ...(record.accountName !== undefined
      ? { [f.accountName]: record.accountName }
      : {}),
    ...(record.accountType !== undefined
      ? { [f.accountType]: record.accountType }
      : {}),
    ...(record.accountStatus !== undefined
      ? { [f.accountStatus]: record.accountStatus }
      : {}),
    ...(record.animatorName !== undefined
      ? { [f.animatorName]: record.animatorName }
      : {}),
    ...(record.userId !== undefined ? { [f.userId]: record.userId } : {}),
    ...(record.startCredits !== undefined
      ? { [f.startCredits]: record.startCredits }
      : {}),
    ...(record.remark !== undefined ? { [f.remark]: record.remark } : {})
  };
}

export function toRankingFields(record: RankingRecord): RawFields {
  const f = TABLE_FIELDS.rankings;
  return {
    [f.month]: record.month,
    [f.rank]: record.rank,
    [f.animatorName]: record.animatorName,
    [f.group]: record.group,
    [f.roughCutSeconds]: record.roughCutSeconds,
    [f.weightedRoughCutSeconds]: record.weightedRoughCutSeconds,
    [f.averageWeight]: record.averageWeight,
    [f.updatedAt]: dateTimeToMs(record.updatedAt)
  };
}

export function toPushLogFields(record: PushLogRecord): RawFields {
  const f = TABLE_FIELDS.pushLogs;
  return {
    [f.date]: dateToMs(record.date),
    [f.userId]: record.userId,
    [f.name]: record.name,
    [f.role]: record.role,
    [f.group]: record.group,
    [f.type]: record.type,
    [f.pushedAt]: dateTimeToMs(record.pushedAt),
    [f.status]: record.status,
    [f.failedReason]: record.failedReason || ""
  };
}

export async function getPeople() {
  const records = await listRecords<RawFields>("people");
  return records.map((record) => ({
    recordId: record.recordId,
    fields: mapPerson(record.fields)
  }));
}

export async function getAccounts() {
  const records = await listRecords<RawFields>("accounts");
  return records.map((record) => ({
    recordId: record.recordId,
    fields: mapAccount(record.fields)
  }));
}

export async function getDailyRecords() {
  const records = await listRecords<RawFields>("daily");
  return records.map((record) => ({
    recordId: record.recordId,
    fields: mapDaily(record.fields)
  }));
}

export async function getReviewRecords() {
  const records = await listRecords<RawFields>("reviews");
  return records.map((record) => ({
    recordId: record.recordId,
    fields: mapReview(record.fields)
  }));
}

export async function getRankingRecords() {
  const records = await listRecords<RawFields>("rankings");
  return records.map((record) => ({
    recordId: record.recordId,
    fields: mapRanking(record.fields)
  }));
}

export async function getPushLogRecords() {
  return listRecords<RawFields>("pushLogs");
}

export function enabledPeople(records: BitableRecord<Person>[]) {
  return records.filter((record) => record.fields.enabled === YES_NO.yes);
}

export function activeAnimators(records: BitableRecord<Person>[]) {
  return enabledPeople(records).filter(
    (record) => record.fields.role === ROLES.animator
  );
}

export function activeDirectors(records: BitableRecord<Person>[]) {
  return enabledPeople(records).filter(
    (record) => record.fields.role === ROLES.director
  );
}

export function enabledAccounts(records: BitableRecord<Account>[]) {
  return records.filter(
    (record) =>
      record.fields.accountStatus === ACCOUNT_STATUS.enabled ||
      isEnabledValue(record.fields.accountStatus)
  );
}
