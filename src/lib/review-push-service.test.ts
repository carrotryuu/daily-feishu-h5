import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test, { type TestContext } from "node:test";
import {
  DAILY_STATUS,
  DAILY_TYPES,
  PUSH_TYPES,
  ROLES,
  TABLE_FIELDS,
  YES_NO
} from "./constants";
import { resetBitableCachesForTest } from "./bitable";
import { buildReviewPushPlan, runReviewPush } from "./review-push-service";
import type { BitableRecord, DailyRecord, Person } from "./types";

process.env.FEISHU_APP_ID ||= "app_id";
process.env.FEISHU_APP_SECRET ||= "app_secret";
process.env.FEISHU_BASE_APP_TOKEN ||= "app_token";
process.env.APP_URL ||= "http://localhost:3000";
process.env.CRON_SECRET ||= "cron_secret";

test("push-review route file exists", () => {
  assert.equal(existsSync("src/app/api/cron/push-review/route.ts"), true);
});

test("push-review only targets enabled directors", () => {
  const plan = buildReviewPushPlan({
    people: [
      person({ userId: "director_1", role: ROLES.director }),
      person({ userId: "animator_1", role: ROLES.animator }),
      person({ userId: "manager_1", role: ROLES.manager })
    ],
    logs: [],
    daily: [daily("daily_1", { date: "2026-06-01", group: "孙导组" })],
    date: "2026-06-02",
    reviewDate: "2026-06-01"
  });

  assert.equal(plan.targets.length, 1);
  assert.equal(plan.targets[0].person.userId, "director_1");
  assert.equal(plan.targets[0].person.role, ROLES.director);
  assert.equal(plan.skipped.length, 2);
  assert.deepEqual(
    plan.skipped.map((item) => item.skipReason),
    ["unsupported_role", "unsupported_role"]
  );
});

test("Tuesday push-review reminds Monday pending reviews", () => {
  const plan = buildReviewPushPlan({
    people: [person({ userId: "sun_director", group: "孙导组" })],
    logs: [],
    daily: [
      daily("monday_pending", { date: "2026-06-01", group: "孙导组" }),
      daily("tuesday_pending", { date: "2026-06-02", group: "孙导组" })
    ],
    date: "2026-06-02",
    reviewDate: "2026-06-01"
  });

  assert.equal(plan.targets.length, 1);
  assert.equal(plan.targets[0].pending.length, 1);
  assert.equal(plan.targets[0].pending[0].recordId, "monday_pending");
});

test("Sunday push-review reminds Saturday pending reviews", () => {
  const plan = buildReviewPushPlan({
    people: [person({ userId: "ma_director", group: "马导组" })],
    logs: [],
    daily: [
      daily("saturday_pending", { date: "2026-06-06", group: "马导组" }),
      daily("sunday_pending", { date: "2026-06-07", group: "马导组" })
    ],
    date: "2026-06-07",
    reviewDate: "2026-06-06"
  });

  assert.equal(plan.targets.length, 1);
  assert.equal(plan.targets[0].pending.length, 1);
  assert.equal(plan.targets[0].pending[0].recordId, "saturday_pending");
});

test("Monday push-review skips without force", () => {
  const plan = buildReviewPushPlan({
    people: [person({ userId: "director_1" })],
    logs: [],
    daily: [daily("daily_1", { date: "2026-06-07", group: "孙导组" })],
    date: "2026-06-08",
    reviewDate: "2026-06-07"
  });

  assert.equal(plan.targets.length, 0);
  assert.equal(plan.skipped[0].skipReason, "today_not_review_day");
});

test("force push-review bypasses weekday rule", () => {
  const plan = buildReviewPushPlan({
    people: [person({ userId: "director_1" })],
    logs: [],
    daily: [daily("daily_1", { date: "2026-06-07", group: "孙导组" })],
    date: "2026-06-08",
    reviewDate: "2026-06-07",
    force: true
  });

  assert.equal(plan.skipped.length, 0);
  assert.equal(plan.targets.length, 1);
});

test("directors only receive pending review counts for their own group", () => {
  const plan = buildReviewPushPlan({
    people: [
      person({ userId: "sun_director", name: "孙导", group: "孙导组" }),
      person({ userId: "ma_director", name: "马导", group: "马导组" })
    ],
    logs: [],
    daily: [
      daily("sun_1", { name: "赵国微", date: "2026-06-03", group: "孙导组" }),
      daily("sun_2", { name: "单多多", date: "2026-06-03", group: "孙导组" }),
      daily("ma_1", { name: "张宇佳", date: "2026-06-03", group: "马导组" })
    ],
    date: "2026-06-04",
    reviewDate: "2026-06-03"
  });

  const byUserId = new Map(
    plan.targets.map((target) => [target.person.userId, target])
  );
  assert.equal(byUserId.get("sun_director")?.pending.length, 2);
  assert.equal(byUserId.get("ma_director")?.pending.length, 1);
  assert.deepEqual(byUserId.get("sun_director")?.pendingNames, [
    "赵国微",
    "单多多"
  ]);
  assert.deepEqual(byUserId.get("ma_director")?.pendingNames, ["张宇佳"]);
});

test("director with no pending review is skipped", () => {
  const plan = buildReviewPushPlan({
    people: [person({ userId: "sun_director", group: "孙导组" })],
    logs: [],
    daily: [daily("ma_1", { date: "2026-06-03", group: "马导组" })],
    date: "2026-06-04",
    reviewDate: "2026-06-03"
  });

  assert.equal(plan.targets.length, 0);
  assert.equal(plan.skipped[0].skipReason, "no_pending_review");
});

test("push-review duplicate only checks review reminder type", () => {
  const baseInput = {
    people: [person({ userId: "director_1" })],
    daily: [daily("daily_1", { date: "2026-06-03", group: "孙导组" })],
    date: "2026-06-04",
    reviewDate: "2026-06-03"
  };

  const duplicated = buildReviewPushPlan({
    ...baseInput,
    logs: [pushLog("director_1", PUSH_TYPES.review, "2026-06-04")]
  });
  const notDuplicatedByDaily = buildReviewPushPlan({
    ...baseInput,
    logs: [pushLog("director_1", PUSH_TYPES.daily, "2026-06-04")]
  });

  assert.equal(duplicated.targets.length, 0);
  assert.equal(duplicated.skipped[0].skipReason, "duplicate_push_today");
  assert.equal(notDuplicatedByDaily.skipped.length, 0);
  assert.equal(notDuplicatedByDaily.targets.length, 1);
});

test("effectiveGroup fallback resolves opt group from people table", () => {
  const plan = buildReviewPushPlan({
    people: [
      person({ userId: "sun_director", group: "孙导组" }),
      person({
        userId: "animator_1",
        name: "赵国微",
        role: ROLES.animator,
        group: "孙导组"
      })
    ],
    logs: [],
    daily: [
      daily("daily_opt_group", {
        userId: "animator_1",
        name: "赵国微",
        date: "2026-06-03",
        group: "optabcdef"
      })
    ],
    date: "2026-06-04",
    reviewDate: "2026-06-03"
  });

  assert.equal(plan.targets.length, 1);
  assert.equal(plan.targets[0].pending.length, 1);
  assert.equal(plan.targets[0].pending[0].recordId, "daily_opt_group");
});

test("runReviewPush sends by user_id and writes review reminder log", async (t) => {
  const mock = installReviewPushFetchMock(t, {
    people: [person({ userId: "director_1", name: "孙导", group: "孙导组" })],
    daily: [daily("daily_1", { date: "2026-06-03", group: "孙导组" })],
    logs: []
  });

  const result = await runReviewPush({
    date: "2026-06-04",
    reviewDate: "2026-06-03"
  });

  assert.equal(result.total, 1);
  assert.equal(result.results[0].receiveIdType, "user_id");
  assert.equal(result.results[0].receiveId, "director_1");
  assert.equal(mock.messageUrls.length, 1);
  assert.match(mock.messageUrls[0], /receive_id_type=user_id/);
  assert.equal(mock.messageBodies[0].receive_id, "director_1");
  assert.equal(mock.recordsWrites.length, 1);
  assert.equal(
    mock.recordsWrites[0].fields[TABLE_FIELDS.pushLogs.type],
    PUSH_TYPES.review
  );
  assert.equal(
    mock.recordsWrites[0].fields[TABLE_FIELDS.pushLogs.receiveIdType],
    "user_id"
  );
});

test("force runReviewPush is test push and does not write duplicate-affecting log", async (t) => {
  const mock = installReviewPushFetchMock(t, {
    people: [person({ userId: "director_1", name: "孙导", group: "孙导组" })],
    daily: [daily("daily_1", { date: "2026-06-07", group: "孙导组" })],
    logs: [pushLog("director_1", PUSH_TYPES.review, "2026-06-08")]
  });

  const result = await runReviewPush({
    date: "2026-06-08",
    reviewDate: "2026-06-07",
    force: true
  });

  assert.equal(result.results[0].isTestPush, true);
  assert.equal(result.results[0].skipped, false);
  assert.equal(mock.messageUrls.length, 1);
  assert.equal(mock.recordsWrites.length, 0);
});

function installReviewPushFetchMock(
  t: TestContext,
  records: {
    people: Person[];
    daily: BitableRecord<DailyRecord>[];
    logs: BitableRecord<Record<string, unknown>>[];
  }
) {
  resetBitableCachesForTest();
  const originalFetch = globalThis.fetch;
  const messageUrls: string[] = [];
  const messageBodies: Array<{ receive_id?: string }> = [];
  const recordsWrites: Array<{ fields: Record<string, unknown> }> = [];

  process.env.FEISHU_APP_ID = "app_id";
  process.env.FEISHU_APP_SECRET = "app_secret";
  process.env.FEISHU_BASE_APP_TOKEN = "app_token";
  process.env.APP_URL = "http://47.110.53.170";
  process.env.CRON_SECRET = "cron_secret";
  process.env.FEISHU_TABLE_PEOPLE = "tbl_people";
  process.env.FEISHU_TABLE_DAILY = "tbl_daily";
  process.env.FEISHU_TABLE_PUSH_LOGS = "tbl_push_logs";

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";

    if (url.includes("/tenant_access_token/internal")) {
      return Response.json({
        code: 0,
        tenant_access_token: "tenant_token",
        expire: 7200
      });
    }

    if (url.includes("/open-apis/im/v1/messages")) {
      messageUrls.push(url);
      messageBodies.push(JSON.parse(String(init?.body || "{}")));
      return Response.json({
        code: 0,
        data: { message_id: "msg_1" }
      });
    }

    if (url.includes("/fields")) {
      return Response.json({
        code: 0,
        data: {
          items: fieldsForUrl(url).map((fieldName) => ({
            field_id: `fld_${fieldName}`,
            field_name: fieldName
          })),
          has_more: false
        }
      });
    }

    if (method === "POST" && url.includes("/records")) {
      recordsWrites.push(JSON.parse(String(init?.body || "{}")));
      return Response.json({
        code: 0,
        data: { record: { record_id: "rec_push_log", fields: {} } }
      });
    }

    if (url.includes("/records")) {
      return Response.json({
        code: 0,
        data: {
          items: recordsForUrl(url, records),
          has_more: false
        }
      });
    }

    throw new Error(`Unexpected fetch ${method} ${url}`);
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetBitableCachesForTest();
  });

  return { messageUrls, messageBodies, recordsWrites };
}

function fieldsForUrl(url: string) {
  if (url.includes("tbl_people")) return Object.values(TABLE_FIELDS.people);
  if (url.includes("tbl_daily")) return Object.values(TABLE_FIELDS.daily).filter(Boolean);
  if (url.includes("tbl_push_logs")) return Object.values(TABLE_FIELDS.pushLogs);
  return [];
}

function recordsForUrl(
  url: string,
  records: {
    people: Person[];
    daily: BitableRecord<DailyRecord>[];
    logs: BitableRecord<Record<string, unknown>>[];
  }
) {
  if (url.includes("tbl_people")) {
    return records.people.map((item, index) => ({
      record_id: `person_${index}`,
      fields: toPersonFields(item)
    }));
  }
  if (url.includes("tbl_daily")) {
    return records.daily.map((item) => ({
      record_id: item.recordId,
      fields: toDailyFields(item.fields)
    }));
  }
  if (url.includes("tbl_push_logs")) {
    return records.logs.map((item) => ({
      record_id: item.recordId,
      fields: item.fields
    }));
  }
  return [];
}

function toPersonFields(person: Person) {
  const f = TABLE_FIELDS.people;
  return {
    [f.userId]: person.userId,
    [f.name]: person.name,
    [f.role]: person.role,
    [f.group]: person.group,
    [f.enabled]: person.enabled
  };
}

function toDailyFields(record: DailyRecord) {
  const f = TABLE_FIELDS.daily;
  return {
    [f.date]: record.date,
    [f.userId]: record.userId,
    [f.name]: record.name,
    [f.group]: record.group,
    [f.status]: record.status,
    [f.dailyType || "日报类型"]: record.dailyType,
    [f.changedAccount]: record.changedAccount,
    [f.account]: record.account,
    [f.platform]: record.platform,
    [f.accountType]: record.accountType,
    [f.previousCredits]: record.previousCredits,
    [f.newAccountStartCredits]: record.newAccountStartCredits,
    [f.remainingCredits]: record.remainingCredits,
    [f.consumedCredits]: record.consumedCredits || 0,
    [f.assetCount]: record.assetCount,
    [f.roughCutSeconds]: record.roughCutSeconds,
    [f.hasIssue]: record.hasIssue,
    [f.issueNote]: record.issueNote || "",
    [f.nonProductionNote]: record.nonProductionNote || "",
    [f.includeRanking]: record.includeRanking,
    [f.month]: record.month,
    [f.submittedAt]: record.submittedAt
  };
}

function person(overrides: Partial<Person> = {}): Person {
  return {
    userId: "director_1",
    name: "Director",
    role: ROLES.director,
    group: "孙导组",
    enabled: YES_NO.yes,
    ...overrides
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
      date: "2026-06-03",
      userId: "animator_1",
      name: "Animator",
      group: "孙导组",
      changedAccount: YES_NO.no,
      account: "Account",
      platform: "LIBTV",
      accountType: "",
      previousCredits: 0,
      newAccountStartCredits: 0,
      remainingCredits: 0,
      consumedCredits: 0,
      assetCount: 0,
      roughCutSeconds: 0,
      hasIssue: YES_NO.no,
      issueNote: "",
      nonProductionNote: "",
      status: DAILY_STATUS.pending,
      includeRanking: YES_NO.no,
      month: "2026-06",
      submittedAt: "2026-06-03T10:00:00.000Z",
      ...overrides
    }
  };
}

function pushLog(
  userId: string,
  type: string,
  date: string
): BitableRecord<Record<string, unknown>> {
  return {
    recordId: `log_${userId}_${type}`,
    fields: {
      [TABLE_FIELDS.pushLogs.date]: date,
      [TABLE_FIELDS.pushLogs.userId]: userId,
      [TABLE_FIELDS.pushLogs.type]: type
    }
  };
}
