import {
  ACCOUNT_STATUS,
  DAILY_TYPES,
  ROLES,
  TABLE_FIELDS,
  YES_NO,
  isEnabledValue,
  isPlatformOption,
  normalizeAccountAdminPermission,
  normalizeAccountType,
  normalizeEnabled,
  normalizeRole,
  type ReviewGrade
} from "./constants";
import { listRecords } from "./bitable";
import { formatDate } from "./dates";
import { recordNormalizePerf } from "./perf";
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

const unresolvedOptionWarnings = new Set<string>();

export function fieldText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => fieldText(item))
      .join("");
  }
  if (typeof value === "object") {
    if ("text" in value) return String(value.text);
    if ("name" in value) return String(value.name);
    if ("value" in value) return String(value.value);
  }
  return String(value);
}

export function normalizeFieldText(value: unknown) {
  return fieldText(value).trim();
}

export function normalizeGroupName(value: unknown) {
  return groupText(value).replace(/[\s\u3000]+/g, "");
}

function text(value: unknown) {
  return fieldText(value);
}

function groupText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const current = groupText(item);
      if (current) return current;
    }
    return "";
  }
  if (typeof value === "object") {
    if ("text" in value) return String(value.text).trim();
    if ("name" in value) return String(value.name).trim();
    if ("value" in value) return String(value.value).trim();
  }
  return String(value).trim();
}

function warnUnresolvedOption(
  table: "people" | "daily",
  fieldName: string,
  rawValue: unknown,
  recordId: string
) {
  const value = fieldText(rawValue);
  if (!/^opt[a-z0-9]+$/i.test(value)) return;
  const warningKey = `${table}:${fieldName}:${value}`;
  if (unresolvedOptionWarnings.has(warningKey)) return;
  unresolvedOptionWarnings.add(warningKey);

  console.warn("[Bitable option unresolved]", {
    table,
    fieldName,
    rawValue: value,
    recordId
  });
}

function number(value: unknown) {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown) {
  if (value == null || value === "") return undefined;
  const parsed = Number(text(value));
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

function firstNumber(fields: RawFields, names: string[]) {
  for (const name of names) {
    const value = optionalNumber(fields[name]);
    if (value !== undefined) return value;
  }
  return 0;
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
    group: normalizeFieldText(firstText(fields, [f.group, "小组", "组别"])),
    accountAdminPermission: normalizeAccountAdminPermission(
      text(fields[f.accountAdminPermission])
    ),
    enabled: normalizeEnabled(text(fields[f.enabled])),
    remark: text(fields[f.remark])
  };
}

export function mapAccount(fields: RawFields): Account {
  const f = TABLE_FIELDS.accounts;
  const platform = text(fields[f.platform]);
  return {
    accountId: text(fields[f.accountId]),
    group: normalizeFieldText(firstText(fields, [f.group, "小组", "组别"])),
    platform: isPlatformOption(platform) ? platform : "其他",
    accountName: text(fields[f.accountName]),
    accountType: normalizeAccountType(text(fields[f.accountType])),
    accountStatus: firstText(fields, [
      f.accountStatus,
      "可用状态",
      "是否启用",
      "启用状态"
    ]) as Account["accountStatus"],
    animatorName: firstText(fields, [
      f.animatorName,
      "人员",
      "绑定人员",
      "姓名",
      "动画师",
      "绑定人"
    ]),
    userId: firstText(fields, [f.userId, "绑定用户ID", "绑定人员ID"]),
    startCredits: firstNumber(fields, [
      f.startCredits,
      "起始积分",
      "初始积分",
      "startCredits"
    ]),
    currentRemainingCredits: optionalNumber(
      fields[f.currentRemainingCredits] ??
        fields["剩余积分"] ??
        fields["今日剩余积分"] ??
        fields["最近剩余积分"]
    ),
    lastUseDate: date(fields[f.lastUseDate]),
    lastUser: text(fields[f.lastUser]),
    lastDailyId: text(fields[f.lastDailyId]),
    remark: text(fields[f.remark])
  };
}

function dailyTypeFromFields(fields: RawFields) {
  const f = TABLE_FIELDS.daily;
  const mappedType = f.dailyType ? text(fields[f.dailyType]).trim() : "";
  if ((Object.values(DAILY_TYPES) as string[]).includes(mappedType)) {
    return mappedType as DailyRecord["dailyType"];
  }

  const otherPeriodContent = text(fields[f.nonProductionNote]);
  if (otherPeriodContent) return DAILY_TYPES.other;

  return DAILY_TYPES.production;
}

export function mapDaily(fields: RawFields): DailyRecord {
  const f = TABLE_FIELDS.daily;
  return {
    dailyId: text(fields[f.dailyId]),
    dailyType: dailyTypeFromFields(fields),
    accountRecordId: text(fields[f.accountRecordId]),
    date: date(fields[f.date]),
    userId: text(fields[f.userId]),
    name: text(fields[f.name]),
    group: normalizeFieldText(fields[f.group]),
    changedAccount: text(fields[f.changedAccount]) as DailyRecord["changedAccount"],
    account: text(fields[f.account]),
    platform: text(fields[f.platform]),
    accountType: text(fields[f.accountType]) as DailyRecord["accountType"],
    projectName: text(fields[f.projectName]),
    projectType: text(fields[f.projectType]),
    previousCredits: number(fields[f.previousCredits]),
    newAccountStartCredits: number(fields[f.newAccountStartCredits]),
    remainingCredits: number(fields[f.remainingCredits]),
    consumedCredits: optionalNumber(fields[f.consumedCredits]),
    assetCount: number(fields[f.assetCount]),
    roughCutSeconds: number(fields[f.roughCutSeconds]),
    hasIssue: text(fields[f.hasIssue]) as DailyRecord["hasIssue"],
    issueNote: text(fields[f.issueNote]),
    nonProductionNote: f.nonProductionNote ? text(fields[f.nonProductionNote]) : "",
    status: text(fields[f.status]).trim() as DailyRecord["status"],
    includeRanking: text(fields[f.includeRanking]) as DailyRecord["includeRanking"],
    reviewReply: text(fields[f.reviewReply]),
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
  return compactFields([
    [f.dailyType, record.dailyType],
    [f.accountRecordId, record.accountRecordId],
    [f.date, dateToMs(record.date)],
    [f.userId, record.userId],
    [f.name, record.name],
    [f.group, record.group],
    [f.changedAccount, record.changedAccount],
    [f.account, record.account],
    [f.platform, record.platform],
    [f.accountType, record.accountType],
    [f.projectName, record.projectName || ""],
    [f.projectType, record.projectType || ""],
    [f.previousCredits, record.previousCredits],
    [f.newAccountStartCredits, record.newAccountStartCredits],
    [f.remainingCredits, record.remainingCredits],
    [f.consumedCredits, record.consumedCredits ?? 0],
    [f.assetCount, record.assetCount],
    [f.roughCutSeconds, record.roughCutSeconds],
    [f.hasIssue, record.hasIssue],
    [f.issueNote, record.issueNote || ""],
    [f.nonProductionNote, record.nonProductionNote || ""],
    [f.status, record.status],
    [f.includeRanking, record.includeRanking],
    [f.month, record.month],
    [f.submittedAt, dateTimeToMs(record.submittedAt)]
  ]);
}

function compactFields(entries: Array<[string | null | undefined, unknown]>) {
  const fields: RawFields = {};

  for (const [name, value] of entries) {
    if (!name || value == null) continue;
    fields[name] = value;
  }

  return fields;
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
      ? { [f.accountType]: normalizeAccountType(record.accountType) }
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
    ...(record.currentRemainingCredits !== undefined
      ? { [f.currentRemainingCredits]: record.currentRemainingCredits }
      : {}),
    ...(record.lastUseDate !== undefined ? { [f.lastUseDate]: record.lastUseDate } : {}),
    ...(record.lastUser !== undefined ? { [f.lastUser]: record.lastUser } : {}),
    ...(record.lastDailyId !== undefined ? { [f.lastDailyId]: record.lastDailyId } : {}),
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
    [f.receiveIdType]: record.receiveIdType || "",
    [f.receiveId]: record.receiveId || "",
    [f.pushedAt]: dateTimeToMs(record.pushedAt),
    [f.status]: record.status,
    [f.failedReason]: record.failedReason || ""
  };
}

export async function getPeople() {
  const records = await listRecords<RawFields>("people");
  const startedAt = performance.now();
  const mapped = records.map((record) => ({
    recordId: record.recordId,
    fields: (() => {
      warnUnresolvedOption(
        "people",
        TABLE_FIELDS.people.group,
        record.fields[TABLE_FIELDS.people.group],
        record.recordId
      );
      warnUnresolvedOption(
        "people",
        TABLE_FIELDS.people.accountAdminPermission,
        record.fields[TABLE_FIELDS.people.accountAdminPermission],
        record.recordId
      );
      return mapPerson(record.fields);
    })()
  }));
  recordNormalizePerf(performance.now() - startedAt);
  return mapped;
}

export async function getAccounts() {
  const records = await listRecords<RawFields>("accounts");
  const startedAt = performance.now();
  const mapped = records.map((record) => ({
    recordId: record.recordId,
    fields: mapAccount(record.fields)
  }));
  recordNormalizePerf(performance.now() - startedAt);
  return mapped;
}

export async function getDailyRecords() {
  const records = await listRecords<RawFields>("daily");
  const startedAt = performance.now();
  const mapped = records.map((record) => ({
    recordId: record.recordId,
    fields: (() => {
      warnUnresolvedOption(
        "daily",
        TABLE_FIELDS.daily.group,
        record.fields[TABLE_FIELDS.daily.group],
        record.recordId
      );
      return mapDaily(record.fields);
    })()
  }));
  recordNormalizePerf(performance.now() - startedAt);
  return mapped;
}

export async function getReviewRecords() {
  const records = await listRecords<RawFields>("reviews");
  const startedAt = performance.now();
  const mapped = records.map((record) => ({
    recordId: record.recordId,
    fields: mapReview(record.fields)
  }));
  recordNormalizePerf(performance.now() - startedAt);
  return mapped;
}

export async function getRankingRecords() {
  const records = await listRecords<RawFields>("rankings");
  const startedAt = performance.now();
  const mapped = records.map((record) => ({
    recordId: record.recordId,
    fields: mapRanking(record.fields)
  }));
  recordNormalizePerf(performance.now() - startedAt);
  return mapped;
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
