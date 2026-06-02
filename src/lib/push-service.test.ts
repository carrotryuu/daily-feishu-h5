import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { TABLE_FIELDS, PUSH_TYPES, ROLES, YES_NO } from "./constants";
import { resetBitableCachesForTest } from "./bitable";
import { sendBotMessage } from "./feishu";
import { pushOne } from "./push-service";
import type { Person } from "./types";

test("sendBotMessage sends by Feishu user_id", async (t) => {
  const mock = installPushFetchMock(t);

  await sendBotMessage({ userId: "g42g6447", text: "hello" });

  assert.equal(mock.messageUrls.length, 1);
  assert.match(mock.messageUrls[0], /receive_id_type=user_id/);
  assert.doesNotMatch(mock.messageUrls[0], /receive_id_type=open_id/);
  assert.equal(mock.messageBodies[0].receive_id, "g42g6447");
});

test("missing userId does not call Feishu message API and records failure", async (t) => {
  const mock = installPushFetchMock(t);
  const person: Person = {
    userId: "",
    name: "Animator",
    role: ROLES.animator,
    group: "A",
    enabled: YES_NO.yes
  };

  const result = await pushOne(person, PUSH_TYPES.daily, "hello", "2026-06-02");

  assert.equal(mock.messageUrls.length, 0);
  assert.equal(mock.recordsWrites.length, 1);
  assert.equal(result.failedReason, "缺少用户ID");
});

function installPushFetchMock(t: TestContext) {
  resetBitableCachesForTest();
  const originalFetch = globalThis.fetch;
  const messageUrls: string[] = [];
  const messageBodies: Array<{ receive_id?: string }> = [];
  const recordsWrites: unknown[] = [];

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
