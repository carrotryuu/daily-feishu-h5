import assert from "node:assert/strict";
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
import { sendBotMessage } from "./feishu";
import { buildPushPlan, pushOne } from "./push-service";
import type { BitableRecord, DailyRecord, Person } from "./types";

test("sendBotMessage sends by Feishu user_id", async (t) => {
  const mock = installPushFetchMock(t);

  await sendBotMessage({ userId: "851g9gb4", text: "hello" });

  assert.equal(mock.messageUrls.length, 1);
  assert.match(mock.messageUrls[0], /receive_id_type=user_id/);
  assert.doesNotMatch(mock.messageUrls[0], /receive_id_type=open_id/);
  assert.equal(mock.messageBodies[0].receive_id, "851g9gb4");
});

test("missing userId does not call Feishu message API and records failure", async (t) => {
  const mock = installPushFetchMock(t);
  const result = await pushOne(
    person({ userId: "", role: ROLES.animator }),
    PUSH_TYPES.daily,
    "hello",
    "2026-06-02"
  );

  assert.equal(mock.messageUrls.length, 0);
  assert.equal(mock.recordsWrites.length, 1);
  assert.equal(result.skipped, true);
  assert.equal(result.skipReason, "missing_user_id");
  assert.equal(result.failedReason, "缺少用户ID");
});

test("submitted animator is skipped with already_submitted_today", () => {
  const plan = buildPushPlan({
    people: [person({ userId: "animator_1", role: ROLES.animator })],
    logs: [],
    daily: [daily("daily_1", { userId: "animator_1", date: "2026-06-02" })],
    date: "2026-06-02"
  });

  assert.equal(plan.skipped[0].skipped, true);
  assert.equal(plan.skipped[0].skipReason, "already_submitted_today");
});

test("director without pending review is skipped with no_pending_review", () => {
  const plan = buildPushPlan({
    people: [person({ userId: "director_1", role: ROLES.director, group: "A" })],
    logs: [],
    daily: [],
    date: "2026-06-02"
  });

  assert.equal(plan.skipped[0].skipReason, "no_pending_review");
});

test("duplicate push is skipped with duplicate_push_today", () => {
  const plan = buildPushPlan({
    people: [person({ userId: "animator_1", role: ROLES.animator })],
    logs: [pushLog("animator_1", PUSH_TYPES.daily, "2026-06-02")],
    daily: [],
    date: "2026-06-02"
  });

  assert.equal(plan.skipped[0].skipReason, "duplicate_push_today");
});

test("force push ignores duplicate_push_today", () => {
  const plan = buildPushPlan({
    people: [person({ userId: "animator_1", role: ROLES.animator })],
    logs: [pushLog("animator_1", PUSH_TYPES.daily, "2026-06-02")],
    daily: [],
    date: "2026-06-02",
    force: true
  });

  assert.equal(plan.skipped.length, 0);
  assert.equal(plan.targets.length, 1);
});

test("missing userId is skipped with missing_user_id", () => {
  const plan = buildPushPlan({
    people: [person({ userId: "", role: ROLES.animator })],
    logs: [],
    daily: [],
    date: "2026-06-02"
  });

  assert.equal(plan.skipped[0].skipReason, "missing_user_id");
});

test("skipped push plan results always include skipReason", () => {
  const plan = buildPushPlan({
    people: [
      person({ userId: "", role: ROLES.animator }),
      person({ userId: "typist_1", role: ROLES.typist })
    ],
    logs: [],
    daily: [],
    date: "2026-06-02"
  });

  assert.equal(plan.skipped.length, 2);
  for (const skipped of plan.skipped) {
    assert.equal(skipped.skipped, true);
    assert.equal(typeof skipped.skipReason, "string");
    assert.equal(skipped.receiveIdType, "user_id");
  }
});

test("successful push result includes receiveIdType user_id", async (t) => {
  installPushFetchMock(t);
  const result = await pushOne(
    person({ userId: "g42g6447", role: ROLES.animator }),
    PUSH_TYPES.daily,
    "hello",
    "2026-06-02"
  );

  assert.equal(result.status, "成功");
  assert.equal(result.receiveIdType, "user_id");
  assert.equal(result.receiveId, "g42g6447");
});

test("push logs record receiveIdType and receiveId", async (t) => {
  const mock = installPushFetchMock(t);
  await pushOne(
    person({ userId: "g42g6447", role: ROLES.animator }),
    PUSH_TYPES.daily,
    "hello",
    "2026-06-02"
  );

  const fields = mock.recordsWrites[0].fields;
  assert.equal(fields[TABLE_FIELDS.pushLogs.receiveIdType], "user_id");
  assert.equal(fields[TABLE_FIELDS.pushLogs.receiveId], "g42g6447");
});

test("Feishu API error keeps original code and msg", async (t) => {
  installPushFetchMock(t, {
    messageError: {
      code: 230001,
      msg: "The request you send is not a valid {open_id} or not exists"
    }
  });

  const result = await pushOne(
    person({ userId: "851g9gb4", role: ROLES.animator }),
    PUSH_TYPES.daily,
    "hello",
    "2026-06-02"
  );

  assert.equal(result.status, "失败");
  assert.equal(result.receiveIdType, "user_id");
  assert.equal(result.receiveId, "851g9gb4");
  assert.equal(result.feishuCode, 230001);
  assert.equal(
    result.feishuMsg,
    "The request you send is not a valid {open_id} or not exists"
  );
});

function installPushFetchMock(
  t: TestContext,
  options: {
    messageError?: { code: number; msg: string };
  } = {}
) {
  resetBitableCachesForTest();
  const originalFetch = globalThis.fetch;
  const messageUrls: string[] = [];
  const messageBodies: Array<{ receive_id?: string }> = [];
  const recordsWrites: Array<{ fields: Record<string, unknown> }> = [];

  process.env.FEISHU_APP_ID = "app_id";
  process.env.FEISHU_APP_SECRET = "app_secret";
  process.env.FEISHU_BASE_APP_TOKEN = "app_token";
  process.env.APP_URL = "http://localhost:3000";
  process.env.CRON_SECRET = "cron_secret";
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
      if (options.messageError) {
        return Response.json(
          {
            code: options.messageError.code,
            msg: options.messageError.msg,
            data: {}
          },
          { status: 400 }
        );
      }
      return Response.json({
        code: 0,
        data: { message_id: "msg_1" }
      });
    }

    if (url.includes("/fields")) {
      return Response.json({
        code: 0,
        data: {
          items: Object.values(TABLE_FIELDS.pushLogs).map((fieldName) => ({
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

    throw new Error(`Unexpected fetch ${method} ${url}`);
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetBitableCachesForTest();
  });

  return { messageUrls, messageBodies, recordsWrites };
}

function person(overrides: Partial<Person> = {}): Person {
  return {
    userId: "user_1",
    name: "User",
    role: ROLES.animator,
    group: "A",
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
      date: "2026-06-02",
      userId: "animator_1",
      name: "Animator",
      group: "A",
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
      submittedAt: "2026-06-02T10:00:00.000Z",
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
    recordId: `log_${userId}`,
    fields: {
      [TABLE_FIELDS.pushLogs.date]: date,
      [TABLE_FIELDS.pushLogs.userId]: userId,
      [TABLE_FIELDS.pushLogs.type]: type
    }
  };
}
