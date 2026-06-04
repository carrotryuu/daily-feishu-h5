import {
  DAILY_STATUS,
  PUSH_TYPES,
  ROLES,
  TABLE_FIELDS,
  isEnabledValue,
  normalizeRole
} from "./constants";
import { createRecord } from "./bitable";
import { addDays, formatDate, nowIso, today } from "./dates";
import { getLoginUrl } from "./env";
import { FeishuApiError, sendBotMessage } from "./feishu";
import {
  getDailyRecords,
  getPeople,
  getPushLogRecords,
  normalizeFieldText,
  normalizeGroupName,
  toPushLogFields
} from "./records";
import { resolveEffectiveDailyGroup } from "./review-service";
import type { BitableRecord, DailyRecord, Person, PushLogRecord } from "./types";

export type ReviewPushSkipReason =
  | "today_not_review_day"
  | "unsupported_role"
  | "no_pending_review"
  | "missing_user_id"
  | "duplicate_push_today";

export type RunReviewPushOptions = {
  force?: boolean;
  date?: string;
  reviewDate?: string;
};

type ReviewPushTarget = {
  person: Person;
  pending: BitableRecord<DailyRecord>[];
  pendingNames: string[];
  text: string;
};

type ReviewPushResult = {
  userId: string;
  name: string;
  role: string;
  group: string;
  type: PushLogRecord["type"];
  pendingCount: number;
  pendingNames: string[];
  status?: PushLogRecord["status"];
  skipped: boolean;
  skipReason?: ReviewPushSkipReason;
  receiveIdType: "user_id";
  receiveId: string;
  feishuCode?: number;
  feishuMsg?: string;
  failedReason?: string;
  isTestPush?: boolean;
};

export async function runReviewPush(options: RunReviewPushOptions = {}) {
  const date = options.date || today();
  const reviewDate = options.reviewDate || addDays(date, -1);
  const force = Boolean(options.force);
  const [people, logs, daily] = await Promise.all([
    getPeople(),
    getPushLogRecords(),
    getDailyRecords()
  ]);
  const plan = buildReviewPushPlan({
    people: people.map((record) => record.fields),
    logs,
    daily,
    date,
    reviewDate,
    force
  });

  const results: ReviewPushResult[] = [];
  for (const skipped of plan.skipped) {
    console.info("[Review push target skipped]", skipped);
    results.push(await writeSkippedReviewPush(skipped, date, force));
  }

  for (const target of plan.targets) {
    const result = await pushReviewOne(target, date, force);
    console.info("[Review push message send result]", {
      userId: result.userId,
      name: result.name,
      group: result.group,
      pendingCount: result.pendingCount,
      receiveIdType: result.receiveIdType,
      success: result.status === "成功",
      failedReason: result.failedReason || null
    });
    results.push(result);
  }

  return {
    date,
    reviewDate,
    total: results.length,
    results
  };
}

export function buildReviewPushPlan(input: {
  people: Person[];
  logs: BitableRecord<Record<string, unknown>>[];
  daily: BitableRecord<DailyRecord>[];
  date: string;
  reviewDate: string;
  force?: boolean;
}) {
  const existingKeys = new Set(
    input.logs.map((record) => {
      const fields = record.fields;
      return [
        logDate(fields[TABLE_FIELDS.pushLogs.date]),
        String(fields[TABLE_FIELDS.pushLogs.userId]),
        String(fields[TABLE_FIELDS.pushLogs.type])
      ].join("|");
    })
  );
  const peopleByUserId = new Map(
    input.people
      .filter((person) => person.userId)
      .map((person) => [person.userId, person])
  );
  const peopleByName = new Map(
    input.people
      .filter((person) => person.name)
      .map((person) => [person.name, person])
  );
  const pendingByGroup = pendingReviewByGroup(
    input.daily,
    input.reviewDate,
    peopleByUserId,
    peopleByName
  );

  const targets: ReviewPushTarget[] = [];
  const skipped: ReviewPushResult[] = [];
  const isReviewDay = input.force || isReviewPushDay(input.date);

  for (const person of input.people) {
    const base = baseResultFor(person, 0, [], Boolean(input.force));
    const role = normalizeRole(String(person.role));
    if (role !== ROLES.director) {
      skipped.push({
        ...base,
        skipReason: "unsupported_role"
      });
      continue;
    }

    if (!isReviewDay) {
      skipped.push({
        ...base,
        skipReason: "today_not_review_day"
      });
      continue;
    }

    if (!isEnabledValue(person.enabled)) {
      skipped.push({
        ...base,
        skipReason: "unsupported_role"
      });
      continue;
    }

    if (!person.userId) {
      skipped.push({
        ...base,
        skipReason: "missing_user_id"
      });
      continue;
    }

    const directorGroup = normalizeGroupName(person.group);
    const pending = pendingByGroup.get(directorGroup) || [];
    const pendingNames = namesForPending(pending);
    if (pending.length === 0) {
      skipped.push({
        ...baseResultFor(person, pending.length, pendingNames, Boolean(input.force)),
        skipReason: "no_pending_review"
      });
      continue;
    }

    const key = [input.date, person.userId, PUSH_TYPES.review].join("|");
    if (!input.force && existingKeys.has(key)) {
      skipped.push({
        ...baseResultFor(person, pending.length, pendingNames, Boolean(input.force)),
        skipReason: "duplicate_push_today"
      });
      continue;
    }

    targets.push({
      person,
      pending,
      pendingNames,
      text: buildReviewPushText({
        date: input.reviewDate,
        group: person.group,
        pendingCount: pending.length,
        pendingNames
      })
    });
  }

  return { targets, skipped };
}

function pendingReviewByGroup(
  daily: BitableRecord<DailyRecord>[],
  reviewDate: string,
  peopleByUserId: Map<string, Person>,
  peopleByName: Map<string, Person>
) {
  const pendingByGroup = new Map<string, BitableRecord<DailyRecord>[]>();
  for (const record of daily) {
    if (record.fields.date !== reviewDate) continue;
    if (normalizeFieldText(record.fields.status) !== DAILY_STATUS.pending) continue;

    const groupResolution = resolveEffectiveDailyGroup(
      record,
      peopleByUserId,
      peopleByName
    );
    const group = normalizeGroupName(groupResolution.effectiveGroup);
    if (!group) continue;

    const current = pendingByGroup.get(group) || [];
    current.push(record);
    pendingByGroup.set(group, current);
  }
  return pendingByGroup;
}

function namesForPending(records: BitableRecord<DailyRecord>[]) {
  return Array.from(
    new Set(records.map((record) => record.fields.name).filter(Boolean))
  );
}

function buildReviewPushText(input: {
  date: string;
  group: string;
  pendingCount: number;
  pendingNames: string[];
}) {
  const visibleNames = input.pendingNames.slice(0, 3);
  return [
    "你有待审核日报",
    "",
    `日期：${input.date}`,
    `所属小组：${input.group}`,
    `待审核数量：${input.pendingCount}`,
    visibleNames.length
      ? `待审核人员：${visibleNames.join("、")}${
          input.pendingNames.length > visibleNames.length ? " 等" : ""
        }`
      : "",
    "",
    "请进入日报系统审核：",
    getLoginUrl()
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function pushReviewOne(
  target: ReviewPushTarget,
  date: string,
  force: boolean
): Promise<ReviewPushResult> {
  const receiveIdType = "user_id" as const;
  const receiveId = target.person.userId;
  const base = baseResultFor(
    target.person,
    target.pending.length,
    target.pendingNames,
    force
  );

  try {
    await sendBotMessage({ userId: receiveId, text: target.text });
    if (!force) {
      await writeReviewPushLog({
        person: target.person,
        date,
        status: "成功",
        failedReason: "",
        receiveIdType,
        receiveId
      });
    }
    return {
      ...base,
      pendingCount: target.pending.length,
      status: "成功",
      skipped: false
    };
  } catch (error) {
    const failedReason = error instanceof Error ? error.message : "unknown_error";
    const feishuCode = error instanceof FeishuApiError ? error.feishuCode : undefined;
    const feishuMsg = error instanceof FeishuApiError ? error.feishuMsg : undefined;
    if (!force) {
      await writeReviewPushLog({
        person: target.person,
        date,
        status: "失败",
        failedReason,
        receiveIdType,
        receiveId
      });
    }
    return {
      ...base,
      pendingCount: target.pending.length,
      status: "失败",
      skipped: false,
      failedReason,
      feishuCode,
      feishuMsg
    };
  }
}

async function writeSkippedReviewPush(
  result: ReviewPushResult,
  date: string,
  force: boolean
) {
  const shouldWriteLog = normalizeRole(String(result.role)) === ROLES.director;
  const withStatus: ReviewPushResult = {
    ...result,
    status: "跳过",
    isTestPush: force || undefined
  };

  if (shouldWriteLog && !force) {
    await writeReviewPushLog({
      person: {
        userId: result.userId,
        name: result.name,
        role: result.role as Person["role"],
        group: result.group,
        enabled: "是" as Person["enabled"]
      },
      date,
      status: "跳过",
      failedReason: result.skipReason || "",
      receiveIdType: "user_id",
      receiveId: result.receiveId
    });
  }

  return withStatus;
}

async function writeReviewPushLog(input: {
  person: Person;
  date: string;
  status: PushLogRecord["status"];
  failedReason: string;
  receiveIdType: "user_id";
  receiveId: string;
}) {
  await createRecord(
    "pushLogs",
    toPushLogFields({
      date: input.date,
      userId: input.person.userId,
      name: input.person.name,
      role: ROLES.director,
      group: input.person.group,
      type: PUSH_TYPES.review,
      receiveIdType: input.receiveIdType,
      receiveId: input.receiveId,
      pushedAt: nowIso(),
      status: input.status,
      failedReason: input.failedReason
    })
  );
}

function baseResultFor(
  person: Person,
  pendingCount: number,
  pendingNames: string[],
  force: boolean
): ReviewPushResult {
  return {
    userId: person.userId,
    name: person.name,
    role: person.role,
    group: person.group,
    type: PUSH_TYPES.review,
    pendingCount,
    pendingNames,
    skipped: true,
    receiveIdType: "user_id",
    receiveId: person.userId,
    isTestPush: force || undefined
  };
}

function isReviewPushDay(date: string) {
  const day = new Date(`${date}T00:00:00+08:00`).getDay();
  return day >= 2 || day === 0;
}

function logDate(value: unknown) {
  if (typeof value === "number") return formatDate(new Date(value));
  return String(value).slice(0, 10);
}
