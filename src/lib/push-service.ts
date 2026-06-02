import {
  PUSH_TYPES,
  ROLES,
  TABLE_FIELDS,
  isEnabledValue,
  normalizeRole
} from "./constants";
import { createRecord } from "./bitable";
import { getEnv } from "./env";
import { FeishuApiError, sendBotMessage } from "./feishu";
import { formatDate, nowIso, today } from "./dates";
import {
  getDailyRecords,
  getPeople,
  getPushLogRecords,
  toPushLogFields
} from "./records";
import type { BitableRecord, DailyRecord, Person, PushLogRecord } from "./types";

export type PushSkipReason =
  | "already_submitted_today"
  | "no_pending_review"
  | "disabled_user"
  | "missing_user_id"
  | "unsupported_role"
  | "today_not_workday"
  | "duplicate_push_today";

export type RunDailyPushOptions = {
  force?: boolean;
  date?: string;
  testUserId?: string;
};

type PushTarget = {
  person: Person;
  type: PushLogRecord["type"];
  text: string;
};

type PushSkippedResult = {
  userId: string;
  name: string;
  role: string;
  group: string;
  type: string;
  skipped: true;
  skipReason: PushSkipReason;
  receiveIdType?: "user_id";
  receiveId?: string;
};

export async function runDailyPush(options: RunDailyPushOptions = {}) {
  const [people, logs, daily] = await Promise.all([
    getPeople(),
    getPushLogRecords(),
    getDailyRecords()
  ]);
  const date = options.date || today();
  const plan = buildPushPlan({
    people: people.map((record) => record.fields),
    logs,
    daily,
    date,
    force: Boolean(options.force),
    testUserId: options.testUserId
  });

  for (const skipped of plan.skipped) {
    console.info("[Push target skipped]", skipped);
  }

  const results: Array<PushSkippedResult | Awaited<ReturnType<typeof pushOne>>> = [
    ...plan.skipped
  ];
  for (const target of plan.targets) {
    const result = await pushOne(target.person, target.type, target.text, date);
    console.info("[Push message send result]", {
      userId: result.userId,
      name: result.name,
      type: result.type,
      receiveIdType: result.receiveIdType,
      success: result.status === "成功",
      failedReason: result.failedReason || null
    });
    results.push(result);
  }

  return {
    date,
    total: results.length,
    results
  };
}

export function buildPushPlan(input: {
  people: Person[];
  logs: BitableRecord<Record<string, unknown>>[];
  daily: BitableRecord<DailyRecord>[];
  date: string;
  force?: boolean;
  testUserId?: string;
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
  const targets: PushTarget[] = [];
  const skipped: PushSkippedResult[] = [];

  for (const person of input.people) {
    if (input.testUserId && person.userId !== input.testUserId) {
      continue;
    }

    const targetType = pushTypeForPerson(person);

    if (input.testUserId) {
      if (!person.userId) {
        skipped.push(skippedResultFor(person, PUSH_TYPES.daily, "missing_user_id"));
        continue;
      }

      targets.push({
        person,
        type: PUSH_TYPES.daily,
        text: pushText(PUSH_TYPES.daily)
      });
      continue;
    }

    const skipReason = resolveSkipReason({
      person,
      type: targetType,
      daily: input.daily,
      date: input.date,
      existingKeys,
      force: Boolean(input.force)
    });

    if (skipReason || !targetType) {
      const skippedResult = skippedResultFor(person, targetType || "", skipReason || "unsupported_role");
      skipped.push(skippedResult);
      continue;
    }

    targets.push({
      person,
      type: targetType,
      text: pushText(targetType)
    });
  }

  return { targets, skipped };
}

function resolveSkipReason(input: {
  person: Person;
  type: PushLogRecord["type"] | undefined;
  daily: BitableRecord<DailyRecord>[];
  date: string;
  existingKeys: Set<string>;
  force: boolean;
}): PushSkipReason | undefined {
  if (!isEnabledValue(input.person.enabled)) return "disabled_user";
  if (!input.person.userId) return "missing_user_id";
  if (!input.type) return "unsupported_role";
  if (!input.force && !isWorkday(input.date)) return "today_not_workday";

  if (input.type === PUSH_TYPES.daily && hasSubmittedToday(input.person, input.daily, input.date)) {
    return "already_submitted_today";
  }

  const key = [input.date, input.person.userId, input.type].join("|");
  if (!input.force && input.existingKeys.has(key)) {
    return "duplicate_push_today";
  }

  return undefined;
}

function pushTypeForPerson(person: Person) {
  const role = normalizeRole(String(person.role));
  if (role === ROLES.animator) return PUSH_TYPES.daily;
  return undefined;
}

function pushText(type: PushLogRecord["type"]) {
  if (type === PUSH_TYPES.daily) {
    return `请及时填写今日或昨日日报：${getEnv().appUrl}/daily`;
  }

  return "";
}

function hasSubmittedToday(
  person: Person,
  daily: BitableRecord<DailyRecord>[],
  date: string
) {
  return daily.some(
    (record) => record.fields.userId === person.userId && record.fields.date === date
  );
}

function skippedResultFor(
  person: Person,
  type: string,
  skipReason: PushSkipReason
): PushSkippedResult {
  return {
    userId: person.userId,
    name: person.name,
    role: person.role,
    group: person.group,
    type,
    skipped: true,
    skipReason,
    receiveIdType: "user_id",
    receiveId: person.userId
  };
}

export async function pushOne(
  person: Person,
  type: PushLogRecord["type"],
  text: string,
  date: string
) {
  const receiveIdType = "user_id" as const;
  const receiveId = person.userId;
  const baseLog = {
    date,
    userId: person.userId,
    name: person.name,
    role: person.role as PushLogRecord["role"],
    group: person.group,
    type,
    receiveIdType,
    receiveId,
    pushedAt: nowIso()
  };

  if (!receiveId) {
    const failedReason = "缺少用户ID";
    console.warn("[Push failed]", {
      receiveIdType,
      receiveId,
      userId: person.userId,
      name: person.name,
      type,
      failedReason
    });
    await createRecord(
      "pushLogs",
      toPushLogFields({
        ...baseLog,
        status: "失败",
        failedReason
      })
    );
    return {
      userId: person.userId,
      name: person.name,
      type,
      skipped: true as const,
      skipReason: "missing_user_id" as const,
      status: "失败" as const,
      failedReason,
      receiveIdType,
      receiveId
    };
  }

  try {
    await sendBotMessage({ userId: receiveId, text });
    console.info("[Push success]", {
      receiveIdType,
      receiveId,
      userId: person.userId,
      name: person.name,
      type
    });
    await createRecord(
      "pushLogs",
      toPushLogFields({ ...baseLog, status: "成功" })
    );
    return {
      userId: person.userId,
      name: person.name,
      type,
      status: "成功" as const,
      receiveIdType,
      receiveId
    };
  } catch (error) {
    const feishuCode = error instanceof FeishuApiError ? error.feishuCode : undefined;
    const feishuMsg = error instanceof FeishuApiError ? error.feishuMsg : undefined;
    const failedReason = error instanceof Error ? error.message : "未知错误";
    console.warn("[Push failed]", {
      receiveIdType,
      receiveId,
      userId: person.userId,
      name: person.name,
      type,
      success: false,
      failedReason,
      feishuCode,
      feishuMsg
    });
    await createRecord(
      "pushLogs",
      toPushLogFields({
        ...baseLog,
        status: "失败",
        failedReason
      })
    );
    return {
      userId: person.userId,
      name: person.name,
      type,
      status: "失败" as const,
      failedReason,
      receiveIdType,
      receiveId,
      feishuCode,
      feishuMsg
    };
  }
}

export function isPushRole(role: string) {
  const normalized = normalizeRole(role);
  return normalized === ROLES.animator;
}

function isWorkday(date: string) {
  const day = new Date(`${date}T00:00:00+08:00`).getDay();
  return day >= 1 && day <= 6;
}

function logDate(value: unknown) {
  if (typeof value === "number") return formatDate(new Date(value));
  return String(value).slice(0, 10);
}
