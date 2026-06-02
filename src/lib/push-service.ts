import {
  PUSH_TYPES,
  ROLES,
  TABLE_FIELDS
} from "./constants";
import { createRecord } from "./bitable";
import { getEnv } from "./env";
import { FeishuApiError, sendBotMessage } from "./feishu";
import { formatDate, nowIso, today } from "./dates";
import {
  activeAnimators,
  activeDirectors,
  getPeople,
  getPushLogRecords,
  toPushLogFields
} from "./records";
import type { Person, PushLogRecord } from "./types";

export async function runDailyPush() {
  const [people, logs] = await Promise.all([getPeople(), getPushLogRecords()]);
  const date = today();
  const targets = [
    ...activeAnimators(people).map((record) => ({
      person: record.fields,
      type: PUSH_TYPES.daily,
      text: `请及时填写今日或昨日日报：${getEnv().appUrl}/daily`
    })),
    ...activeDirectors(people).map((record) => ({
      person: record.fields,
      type: PUSH_TYPES.review,
      text: [
        "请及时审核本组待审核日报。",
        `${getEnv().appUrl}/review`,
        `${getEnv().appUrl}/account`,
        `${getEnv().appUrl}/ranking`
      ].join("\n")
    }))
  ];

  const existingKeys = new Set(
    logs.map((record) => {
      const fields = record.fields;
      return [
        logDate(fields[TABLE_FIELDS.pushLogs.date]),
        String(fields[TABLE_FIELDS.pushLogs.userId]),
        String(fields[TABLE_FIELDS.pushLogs.type])
      ].join("|");
    })
  );

  const results = [];
  for (const target of targets) {
    const key = [date, target.person.userId, target.type].join("|");
    if (existingKeys.has(key)) {
      results.push({
        userId: target.person.userId,
        type: target.type,
        skipped: true
      });
      continue;
    }

    const result = await pushOne(target.person, target.type, target.text, date);
    results.push(result);
  }

  return {
    date,
    total: targets.length,
    results
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
      type,
      status: "失败",
      receiveIdType,
      receiveId,
      failedReason
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
      type,
      status: "成功",
      receiveIdType,
      receiveId
    };
  } catch (error) {
    const feishuCode = error instanceof FeishuApiError ? error.feishuCode : undefined;
    const feishuMsg = error instanceof FeishuApiError ? error.feishuMsg : undefined;
    console.warn("[Push failed]", {
      receiveIdType,
      receiveId,
      userId: person.userId,
      name: person.name,
      type,
      feishuCode,
      feishuMsg
    });
    const failedReason = error instanceof Error ? error.message : "未知错误";
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
      type,
      status: "失败",
      receiveIdType,
      receiveId,
      failedReason
    };
  }
}

export function isPushRole(role: string) {
  return role === ROLES.animator || role === ROLES.director;
}

function logDate(value: unknown) {
  if (typeof value === "number") return formatDate(new Date(value));
  return String(value).slice(0, 10);
}
