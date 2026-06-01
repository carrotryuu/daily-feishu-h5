import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  createRecord,
  getFieldMetaCacheTtlMs,
  getRecordsCacheTtlMs,
  listRecords,
  resetBitableCachesForTest,
  updateRecord
} from "./bitable";

test("fields metadata cache hit avoids repeated Feishu fields API requests", async (t) => {
  const mock = installBitableFetchMock(t);

  await listRecords("daily", { useCache: false });
  await listRecords("daily", { useCache: false });

  assert.equal(mock.counts.fields, 1);
  assert.equal(mock.counts.records, 2);
  assert.equal(getFieldMetaCacheTtlMs(), 10 * 60 * 1000);
});

test("records cache hit avoids repeated Feishu records API requests", async (t) => {
  const mock = installBitableFetchMock(t);

  await listRecords("daily");
  await listRecords("daily");

  assert.equal(mock.counts.records, 1);
});

test("createRecord clears the written table records cache", async (t) => {
  const mock = installBitableFetchMock(t);

  await listRecords("accounts");
  await createRecord("accounts", { name: "created" });
  await listRecords("accounts");

  assert.equal(mock.counts.create, 1);
  assert.equal(mock.counts.records, 2);
});

test("daily submit write clears daily records cache", async (t) => {
  const mock = installBitableFetchMock(t);

  await listRecords("daily");
  await createRecord("daily", { name: "created" });
  await listRecords("daily");

  assert.equal(mock.counts.create, 1);
  assert.equal(mock.counts.records, 2);
});

test("updateRecord clears the written table records cache", async (t) => {
  const mock = installBitableFetchMock(t);

  await listRecords("accounts");
  await updateRecord("accounts", "rec_1", { name: "updated" });
  await listRecords("accounts");

  assert.equal(mock.counts.update, 1);
  assert.equal(mock.counts.records, 2);
});

test("review writes can clear daily, reviews, and rankings records cache", async (t) => {
  const mock = installBitableFetchMock(t);

  await Promise.all([listRecords("daily"), listRecords("reviews"), listRecords("rankings")]);
  await updateRecord("daily", "rec_daily", { status: "approved" });
  await createRecord("reviews", { dailyId: "rec_daily" });
  await updateRecord("rankings", "rec_ranking", { rank: 1 });
  await Promise.all([listRecords("daily"), listRecords("reviews"), listRecords("rankings")]);

  assert.equal(mock.counts.create, 1);
  assert.equal(mock.counts.update, 2);
  assert.equal(mock.counts.records, 6);
});

test("records cache TTLs match table freshness requirements", () => {
  assert.equal(getRecordsCacheTtlMs("people"), 60 * 1000);
  assert.equal(getRecordsCacheTtlMs("accounts"), 60 * 1000);
  assert.equal(getRecordsCacheTtlMs("daily"), 15 * 1000);
  assert.equal(getRecordsCacheTtlMs("reviews"), 15 * 1000);
  assert.equal(getRecordsCacheTtlMs("rankings"), 60 * 1000);
  assert.equal(getRecordsCacheTtlMs("pushLogs"), 60 * 1000);
});

function installBitableFetchMock(t: TestContext) {
  resetBitableCachesForTest();
  const originalFetch = globalThis.fetch;
  const counts = {
    token: 0,
    fields: 0,
    records: 0,
    create: 0,
    update: 0
  };

  process.env.FEISHU_APP_ID = "app_id";
  process.env.FEISHU_APP_SECRET = "app_secret";
  process.env.FEISHU_BASE_APP_TOKEN = "app_token";
  process.env.APP_URL = "http://localhost:3000";
  process.env.CRON_SECRET = "cron_secret";
  process.env.FEISHU_TABLE_DAILY = "tbl_daily";
  process.env.FEISHU_TABLE_ACCOUNTS = "tbl_accounts";
  process.env.FEISHU_TABLE_REVIEWS = "tbl_reviews";
  process.env.FEISHU_TABLE_RANKINGS = "tbl_rankings";

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";

    if (url.includes("/tenant_access_token/internal")) {
      counts.token += 1;
      return Response.json({
        code: 0,
        tenant_access_token: "tenant_token",
        expire: 7200
      });
    }

    if (url.includes("/fields")) {
      counts.fields += 1;
      return Response.json({
        code: 0,
        data: {
          items: [
            {
              field_id: "fld_name",
              field_name: "name",
              property: { options: [{ id: "opt_a", name: "A" }] }
            },
            {
              field_id: "fld_status",
              field_name: "status"
            },
            {
              field_id: "fld_daily_id",
              field_name: "dailyId"
            },
            {
              field_id: "fld_rank",
              field_name: "rank"
            }
          ],
          has_more: false
        }
      });
    }

    if (method === "POST") {
      counts.create += 1;
      return Response.json({
        code: 0,
        data: { record: { record_id: "rec_created", fields: {} } }
      });
    }

    if (method === "PUT") {
      counts.update += 1;
      return Response.json({
        code: 0,
        data: { record: { record_id: "rec_1", fields: {} } }
      });
    }

    if (url.includes("/records")) {
      counts.records += 1;
      return Response.json({
        code: 0,
        data: {
          items: [{ record_id: "rec_1", fields: { name: "opt_a" } }],
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

  return { counts };
}
