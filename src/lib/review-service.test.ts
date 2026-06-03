import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveBitableRecordFields,
  type TableFieldMeta
} from "./bitable";
import {
  ACCOUNT_TYPES,
  DAILY_STATUS,
  DAILY_TYPES,
  PUSH_TYPES,
  ROLES,
  TABLE_FIELDS,
  YES_NO
} from "./constants";
import { FeishuApiError } from "./feishu";
import { mapDaily } from "./records";
import {
  buildReviewListData,
  buildVisiblePendingDailyRecords,
  submitReviewWithDependencies,
  type ReviewDependencies
} from "./review-service";
import type { BitableRecord, CurrentUser, DailyRecord, Person } from "./types";

function director(group = "A组"): CurrentUser {
  return {
    sessionUserId: "director_1",
    sessionSource: "dev_open_id",
    person: {
      userId: "director_1",
      name: "导演",
      role: ROLES.director,
      group,
      enabled: YES_NO.yes
    }
  };
}

function manager(): CurrentUser {
  return {
    sessionUserId: "manager_1",
    sessionSource: "dev_open_id",
    person: {
      userId: "manager_1",
      name: "制片",
      role: ROLES.manager,
      group: "",
      enabled: YES_NO.yes
    }
  };
}

function person(
  recordId: string,
  overrides: Partial<Person> = {}
): BitableRecord<Person> {
  return {
    recordId,
    fields: {
      userId: "animator_1",
      name: "动画师",
      role: ROLES.animator,
      group: "孙导组",
      enabled: YES_NO.yes,
      ...overrides
    }
  };
}

function daily(
  recordId: string,
  overrides: Partial<DailyRecord> = {}
): BitableRecord<DailyRecord> {
  return {
    recordId,
    fields: {
      dailyType: DAILY_TYPES.production,
      date: "2026-05-27",
      userId: "animator_1",
      name: "动画师",
      group: "A组",
      changedAccount: YES_NO.no,
      account: "账号A",
      platform: "LIBTV",
      accountType: ACCOUNT_TYPES.personal,
      previousCredits: 100,
      newAccountStartCredits: 0,
      remainingCredits: 70,
      consumedCredits: 30,
      assetCount: 3,
      roughCutSeconds: 120,
      hasIssue: YES_NO.no,
      issueNote: "",
      nonProductionNote: "",
      status: DAILY_STATUS.pending,
      includeRanking: YES_NO.yes,
      month: "2026-05",
      submittedAt: "2026-05-27T10:00:00.000Z",
      ...overrides
    }
  };
}

function nonProductionDaily(
  recordId: string,
  dailyType: DailyRecord["dailyType"],
  nonProductionNote: string
) {
  return daily(recordId, {
    dailyType,
    account: "",
    platform: "",
    accountType: "",
    previousCredits: 0,
    newAccountStartCredits: 0,
    remainingCredits: 0,
    consumedCredits: undefined,
    assetCount: 0,
    roughCutSeconds: 0,
    includeRanking: YES_NO.no,
    nonProductionNote
  });
}

test("production pending daily appears in review list", () => {
  const rows = buildVisiblePendingDailyRecords(director(), [daily("production")]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].dailyType, DAILY_TYPES.production);
});

test("production pending daily appears even when include ranking is no", () => {
  const rows = buildVisiblePendingDailyRecords(director(), [
    daily("production", { includeRanking: YES_NO.no })
  ]);

  assert.equal(rows.length, 1);
});

test("production pending daily appears even when consumed credits is negative", () => {
  const rows = buildVisiblePendingDailyRecords(director(), [
    daily("production", { consumedCredits: -1 })
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].consumedCredits, -1);
});

test("preparation pending daily appears without an account", () => {
  const rows = buildVisiblePendingDailyRecords(director(), [
    nonProductionDaily("preparation", DAILY_TYPES.preparation, "筹备说明")
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].account, "");
  assert.equal(rows[0].dailyType, DAILY_TYPES.preparation);
});

test("retrospective pending daily appears without an account", () => {
  const rows = buildVisiblePendingDailyRecords(director(), [
    nonProductionDaily("retrospective", DAILY_TYPES.retrospective, "复盘说明")
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].account, "");
  assert.equal(rows[0].dailyType, DAILY_TYPES.retrospective);
});

test("other pending daily appears without an account", () => {
  const rows = buildVisiblePendingDailyRecords(director(), [
    nonProductionDaily("other", DAILY_TYPES.other, "其他说明")
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].account, "");
  assert.equal(rows[0].dailyType, DAILY_TYPES.other);
});

test("non-production daily is not filtered when production metrics are empty", () => {
  const rows = buildVisiblePendingDailyRecords(director(), [
    nonProductionDaily("preparation", DAILY_TYPES.preparation, "筹备说明")
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].consumedCredits, 0);
  assert.equal(rows[0].assetCount, 0);
  assert.equal(rows[0].roughCutSeconds, 0);
});

test("non-production other period content is available for review details", () => {
  const rows = buildVisiblePendingDailyRecords(director(), [
    nonProductionDaily("retrospective", DAILY_TYPES.retrospective, "复盘：流程卡点")
  ]);

  assert.equal(rows[0].nonProductionNote, "复盘：流程卡点");
});

test("director can review non-production daily and update daily status", async () => {
  const record = nonProductionDaily(
    "preparation",
    DAILY_TYPES.preparation,
    "筹备说明"
  );
  let updatedFields: Record<string, unknown> | undefined;

  const dependencies: ReviewDependencies = {
    getDailyRecords: async () => [record],
    updateRecord: async <T extends Record<string, unknown>>(
      _table: string,
      _recordId: string,
      fields: Partial<T>
    ) => {
      updatedFields = fields;
      return { recordId: _recordId, fields: fields as T };
    },
    createRecord: async (_table, fields) => ({ recordId: "review_1", fields }),
    recomputeRanking: async (month) => ({ month, updated: 0 }),
    nowIso: () => "2026-05-27T12:00:00.000Z",
    sendBotMessage: async () => ({ message_id: "msg_1" }),
    appUrl: "http://localhost:3000"
  };

  const result = await submitReviewWithDependencies(
    director(),
    {
      recordId: record.recordId,
      grade: "K2",
      includeRanking: true,
      reviewComment: "筹备日报通过"
    },
    dependencies
  );

  assert.equal(result.status, DAILY_STATUS.approved);
  assert.equal(updatedFields?.[TABLE_FIELDS.daily.status], DAILY_STATUS.approved);
  assert.equal(updatedFields?.[TABLE_FIELDS.daily.reviewReply], "筹备日报通过");
  assert.equal(updatedFields?.["审核状态"], undefined);
  assert.equal(updatedFields?.[TABLE_FIELDS.daily.includeRanking], YES_NO.no);
});

test("director can reject pending daily and update daily status", async () => {
  const record = daily("production");
  let updatedFields: Record<string, unknown> | undefined;

  const dependencies: ReviewDependencies = {
    getDailyRecords: async () => [record],
    updateRecord: async <T extends Record<string, unknown>>(
      _table: string,
      _recordId: string,
      fields: Partial<T>
    ) => {
      updatedFields = fields;
      return { recordId: _recordId, fields: fields as T };
    },
    createRecord: async (_table, fields) => ({ recordId: "review_1", fields }),
    recomputeRanking: async (month) => ({ month, updated: 0 }),
    nowIso: () => "2026-05-27T12:00:00.000Z",
    sendBotMessage: async () => ({ message_id: "msg_1" }),
    appUrl: "http://localhost:3000"
  };

  await submitReviewWithDependencies(
    director(),
    {
      recordId: record.recordId,
      grade: "K2",
      action: "reject",
      reviewComment: "请补充生成问题说明"
    },
    dependencies
  );

  assert.equal(updatedFields?.[TABLE_FIELDS.daily.status], DAILY_STATUS.rejected);
  assert.equal(
    updatedFields?.[TABLE_FIELDS.daily.reviewReply],
    "请补充生成问题说明"
  );
});

test("director can mark pending daily abnormal and update daily status", async () => {
  const record = daily("production");
  let updatedFields: Record<string, unknown> | undefined;

  const dependencies: ReviewDependencies = {
    getDailyRecords: async () => [record],
    updateRecord: async <T extends Record<string, unknown>>(
      _table: string,
      _recordId: string,
      fields: Partial<T>
    ) => {
      updatedFields = fields;
      return { recordId: _recordId, fields: fields as T };
    },
    createRecord: async (_table, fields) => ({ recordId: "review_1", fields }),
    recomputeRanking: async (month) => ({ month, updated: 0 }),
    nowIso: () => "2026-05-27T12:00:00.000Z",
    sendBotMessage: async () => ({ message_id: "msg_1" }),
    appUrl: "http://localhost:3000"
  };

  await submitReviewWithDependencies(
    director(),
    {
      recordId: record.recordId,
      grade: "K2",
      action: "abnormal",
      reviewComment: "异常原因已记录"
    },
    dependencies
  );

  assert.equal(updatedFields?.[TABLE_FIELDS.daily.status], DAILY_STATUS.abnormal);
  assert.equal(updatedFields?.[TABLE_FIELDS.daily.reviewReply], "异常原因已记录");
});

test("review success notifies animator by daily user_id and writes push log", async () => {
  const record = daily("production", { userId: "animator_daily_id" });
  const sentMessages: Array<{ userId: string; text: string }> = [];
  const createdRecords: Array<{ table: string; fields: Record<string, unknown> }> = [];
  const dependencies: ReviewDependencies = {
    getDailyRecords: async () => [record],
    getPeople: async () => [],
    updateRecord: async <T extends Record<string, unknown>>(
      _table: string,
      _recordId: string,
      fields: Partial<T>
    ) => ({ recordId: _recordId, fields: fields as T }),
    createRecord: async (table, fields) => {
      createdRecords.push({ table, fields });
      return { recordId: `rec_${table}`, fields };
    },
    recomputeRanking: async (month) => ({ month, updated: 0 }),
    nowIso: () => "2026-06-03T12:00:00.000Z",
    sendBotMessage: async (message) => {
      sentMessages.push(message);
      return { message_id: "msg_1" };
    },
    appUrl: "http://47.110.53.170/"
  };

  const result = await submitReviewWithDependencies(
    director(),
    {
      recordId: record.recordId,
      grade: "K2",
      action: "reject",
      reviewComment: "请补充今日生成问题说明后重新提交。"
    },
    dependencies
  );

  const pushLog = createdRecords.find((item) => item.table === "pushLogs")?.fields;
  assert.equal(result.reviewNotify.status, "success");
  assert.equal(result.reviewNotify.receiveIdType, "user_id");
  assert.equal(result.reviewNotify.receiveId, "animator_daily_id");
  assert.equal(sentMessages[0].userId, "animator_daily_id");
  assert.match(sentMessages[0].text, /审核结果：驳回/);
  assert.match(sentMessages[0].text, /审核回复：请补充今日生成问题说明后重新提交。/);
  assert.match(sentMessages[0].text, /http:\/\/47\.110\.53\.170\/api\/auth\/login/);
  assert.doesNotMatch(sentMessages[0].text, /47\.110\.53\.170\/\/api\/auth\/login/);
  assert.doesNotMatch(sentMessages[0].text, /\/daily/);
  assert.doesNotMatch(sentMessages[0].text, /\/review/);
  assert.equal(pushLog?.[TABLE_FIELDS.pushLogs.type], PUSH_TYPES.reviewResult);
  assert.equal(pushLog?.[TABLE_FIELDS.pushLogs.status], "成功");
  assert.equal(pushLog?.[TABLE_FIELDS.pushLogs.receiveIdType], "user_id");
  assert.equal(pushLog?.[TABLE_FIELDS.pushLogs.receiveId], "animator_daily_id");
});

test("review notify falls back to people user_id by animator name", async () => {
  const record = daily("production", { userId: "", name: "动画师甲" });
  const sentMessages: Array<{ userId: string; text: string }> = [];
  const dependencies: ReviewDependencies = {
    getDailyRecords: async () => [record],
    getPeople: async () => [
      person("person_1", { userId: "animator_people_id", name: "动画师甲" })
    ],
    updateRecord: async <T extends Record<string, unknown>>(
      _table: string,
      _recordId: string,
      fields: Partial<T>
    ) => ({ recordId: _recordId, fields: fields as T }),
    createRecord: async (_table, fields) => ({ recordId: "rec_1", fields }),
    recomputeRanking: async (month) => ({ month, updated: 0 }),
    nowIso: () => "2026-06-03T12:00:00.000Z",
    sendBotMessage: async (message) => {
      sentMessages.push(message);
      return { message_id: "msg_1" };
    },
    appUrl: "http://localhost:3000"
  };

  const result = await submitReviewWithDependencies(
    director(),
    { recordId: record.recordId, grade: "K2", reviewComment: "" },
    dependencies
  );

  assert.equal(result.reviewNotify.status, "success");
  assert.equal(result.reviewNotify.receiveId, "animator_people_id");
  assert.equal(sentMessages[0].userId, "animator_people_id");
  assert.match(sentMessages[0].text, /审核回复：无/);
});

test("missing animator user_id skips notify without blocking review", async () => {
  const record = daily("production", { userId: "", name: "动画师甲" });
  const createdRecords: Array<{ table: string; fields: Record<string, unknown> }> = [];
  const dependencies: ReviewDependencies = {
    getDailyRecords: async () => [record],
    getPeople: async () => [person("person_1", { userId: "", name: "动画师甲" })],
    updateRecord: async <T extends Record<string, unknown>>(
      _table: string,
      _recordId: string,
      fields: Partial<T>
    ) => ({ recordId: _recordId, fields: fields as T }),
    createRecord: async (table, fields) => {
      createdRecords.push({ table, fields });
      return { recordId: "rec_1", fields };
    },
    recomputeRanking: async (month) => ({ month, updated: 0 }),
    nowIso: () => "2026-06-03T12:00:00.000Z",
    sendBotMessage: async () => {
      throw new Error("should not send");
    },
    appUrl: "http://localhost:3000"
  };

  const result = await submitReviewWithDependencies(
    director(),
    { recordId: record.recordId, grade: "K2" },
    dependencies
  );

  const pushLog = createdRecords.find((item) => item.table === "pushLogs")?.fields;
  assert.equal(result.ok, true);
  assert.equal(result.reviewNotify.status, "skipped");
  assert.equal(result.reviewNotify.reason, "missing_animator_user_id");
  assert.equal(pushLog?.[TABLE_FIELDS.pushLogs.status], "跳过");
  assert.equal(pushLog?.[TABLE_FIELDS.pushLogs.failedReason], "missing_animator_user_id");
});

test("Feishu notify failure does not block review submit", async () => {
  const record = daily("production", { userId: "animator_1" });
  const createdRecords: Array<{ table: string; fields: Record<string, unknown> }> = [];
  const dependencies: ReviewDependencies = {
    getDailyRecords: async () => [record],
    getPeople: async () => [],
    updateRecord: async <T extends Record<string, unknown>>(
      _table: string,
      _recordId: string,
      fields: Partial<T>
    ) => ({ recordId: _recordId, fields: fields as T }),
    createRecord: async (table, fields) => {
      createdRecords.push({ table, fields });
      return { recordId: "rec_1", fields };
    },
    recomputeRanking: async (month) => ({ month, updated: 0 }),
    nowIso: () => "2026-06-03T12:00:00.000Z",
    sendBotMessage: async () => {
      throw new FeishuApiError({
        message: "Feishu failed",
        feishuCode: 230001,
        feishuMsg: "invalid user_id",
        path: "/open-apis/im/v1/messages"
      });
    },
    appUrl: "http://localhost:3000"
  };

  const result = await submitReviewWithDependencies(
    director(),
    { recordId: record.recordId, grade: "K2" },
    dependencies
  );

  const pushLog = createdRecords.find((item) => item.table === "pushLogs")?.fields;
  assert.equal(result.ok, true);
  assert.equal(result.reviewNotify.status, "failed");
  assert.equal(result.reviewNotify.receiveIdType, "user_id");
  assert.equal(result.reviewNotify.receiveId, "animator_1");
  assert.equal(result.reviewNotify.feishuCode, 230001);
  assert.equal(result.reviewNotify.feishuMsg, "invalid user_id");
  assert.equal(pushLog?.[TABLE_FIELDS.pushLogs.status], "失败");
  assert.match(String(pushLog?.[TABLE_FIELDS.pushLogs.failedReason]), /invalid user_id/);
});

test("director cannot see daily records from other groups", () => {
  const rows = buildVisiblePendingDailyRecords(director("A组"), [
    daily("other-group", { group: "B组" })
  ]);

  assert.equal(rows.length, 0);
});

test("director group Sun can see daily group Sun after option id resolution", () => {
  const rows = buildVisiblePendingDailyRecords(director("孙导组"), [
    daily("sun-group", { group: "孙导组" })
  ]);

  assert.equal(rows.length, 1);
});

test("director group Sun can see daily group Sun with surrounding spaces", () => {
  const rows = buildVisiblePendingDailyRecords(director("孙导组"), [
    daily("sun-group", { group: " 孙导组 " })
  ]);

  assert.equal(rows.length, 1);
});

test("director group Sun can see daily group Sun with internal spaces", () => {
  const rows = buildVisiblePendingDailyRecords(director("孙导组"), [
    daily("sun-group", { group: " 孙 导 组 " })
  ]);

  assert.equal(rows.length, 1);
});

test("director group Sun can see daily group option id after metadata resolution", () => {
  const meta: TableFieldMeta = {
    fieldNames: new Set([TABLE_FIELDS.daily.group]),
    optionNameByField: {
      [TABLE_FIELDS.daily.group]: { opt_sun: "孙导组" }
    }
  };
  const fields = resolveBitableRecordFields(
    "daily",
    {
      record_id: "daily_1",
      fields: {
        [TABLE_FIELDS.daily.date]: "2026-05-27",
        [TABLE_FIELDS.daily.userId]: "animator_1",
        [TABLE_FIELDS.daily.name]: "动画师",
        [TABLE_FIELDS.daily.group]: "opt_sun",
        [TABLE_FIELDS.daily.status]: DAILY_STATUS.pending
      }
    },
    meta
  );
  const rows = buildVisiblePendingDailyRecords(director("孙导组"), [
    {
      recordId: "daily_1",
      fields: mapDaily(fields)
    }
  ]);

  assert.equal(rows.length, 1);
});

test("director group Sun cannot see daily group Ma", () => {
  const data = buildReviewListData(director("孙导组"), [
    daily("ma-group", { group: "马导组" })
  ]);

  assert.equal(data.pending.length, 0);
  assert.equal(data.debug.hiddenRecords[0].hiddenReason, "group_mismatch");
  assert.equal(data.debug.hiddenRecords[0].directorGroup, "孙导组");
  assert.equal(data.debug.hiddenRecords[0].group, "马导组");
  assert.equal(data.debug.hiddenRecords[0].rawGroup, "\"马导组\"");
  assert.equal(data.debug.hiddenRecords[0].rawDirectorGroup, "\"孙导组\"");
  assert.equal(data.debug.hiddenRecords[0].normalizedDirectorGroup, "孙导组");
  assert.equal(data.debug.hiddenRecords[0].normalizedGroup, "马导组");
});

test("daily opt group falls back to Zhao Guowei person group Sun by userId", () => {
  const rows = buildVisiblePendingDailyRecords(
    director("孙导组"),
    [
      daily("zhao", {
        userId: "zhao",
        name: "赵国微",
        group: "optDLLzCQZ"
      })
    ],
    [person("zhao", { userId: "zhao", name: "赵国微", group: "孙导组" })]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].group, "孙导组");
});

test("daily opt group falls back to Wang Sen person group Ma by userId", () => {
  const data = buildReviewListData(
    director("孙导组"),
    [
      daily("wang", {
        userId: "wang",
        name: "王森",
        group: "optDLLzCQZ"
      })
    ],
    [person("wang", { userId: "wang", name: "王森", group: "马导组" })]
  );

  assert.equal(data.pending.length, 0);
  assert.equal(data.debug.hiddenRecords[0].hiddenReason, "group_mismatch");
  assert.equal(data.debug.hiddenRecords[0].effectiveGroup, "马导组");
  assert.equal(data.debug.hiddenRecords[0].groupSource, "people_by_user_id");
});

test("director group Ma can see Wang Sen after person group fallback", () => {
  const rows = buildVisiblePendingDailyRecords(
    director("马导组"),
    [
      daily("wang", {
        userId: "wang",
        name: "王森",
        group: "optDLLzCQZ"
      })
    ],
    [person("wang", { userId: "wang", name: "王森", group: "马导组" })]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].group, "马导组");
});

test("manager can see all records after person group fallback", () => {
  const rows = buildVisiblePendingDailyRecords(
    manager(),
    [
      daily("zhao", { userId: "zhao", name: "赵国微", group: "opt_sun" }),
      daily("wang", { userId: "wang", name: "王森", group: "opt_ma" })
    ],
    [
      person("zhao", { userId: "zhao", name: "赵国微", group: "孙导组" }),
      person("wang", { userId: "wang", name: "王森", group: "马导组" })
    ]
  );

  assert.equal(rows.length, 2);
});

test("debug includes group fallback details when userId fallback is used", () => {
  const data = buildReviewListData(
    director("孙导组"),
    [
      daily("zhao", {
        userId: "zhao",
        name: "赵国微",
        group: "optDLLzCQZ"
      })
    ],
    [person("zhao", { userId: "zhao", name: "赵国微", group: "孙导组" })]
  );

  assert.equal(data.debug.groupFallbacks[0].recordId, "zhao");
  assert.equal(data.debug.groupFallbacks[0].fallbackGroup, "孙导组");
  assert.equal(data.debug.groupFallbacks[0].groupSource, "people_by_user_id");
});

test("manager can see all pending daily records", () => {
  const rows = buildVisiblePendingDailyRecords(manager(), [
    daily("sun-group", { group: "孙导组" }),
    daily("ma-group", { group: "马导组" })
  ]);

  assert.equal(rows.length, 2);
});

test("passed, rejected, reviewed, and abnormal statuses do not appear in pending list", () => {
  const rows = buildVisiblePendingDailyRecords(director(), [
    daily("passed", { status: DAILY_STATUS.approved }),
    daily("reviewed", { status: DAILY_STATUS.reviewed }),
    daily("rejected", { status: DAILY_STATUS.rejected }),
    daily("abnormal", { status: DAILY_STATUS.abnormal })
  ]);

  assert.equal(rows.length, 0);
});

test("Chinese director role can use review list", () => {
  const rows = buildVisiblePendingDailyRecords(director(), [daily("production")]);

  assert.equal(rows.length, 1);
});
