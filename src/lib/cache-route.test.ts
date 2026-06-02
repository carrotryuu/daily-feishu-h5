import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/debug/cache/route";

test("/api/debug/cache requires the cron secret and returns status only", async () => {
  process.env.CRON_SECRET = "cache_secret";

  const unauthorized = await GET(
    new Request("http://localhost/api/debug/cache?secret=wrong")
  );
  assert.equal(unauthorized.status, 401);

  const response = await GET(
    new Request("http://localhost/api/debug/cache?secret=cache_secret")
  );
  const payload = await response.json();
  const serialized = JSON.stringify(payload);

  assert.equal(response.status, 200);
  assert.equal(typeof payload.records.accounts.hasCache, "boolean");
  assert.equal(typeof payload.fieldsMeta.accounts.hasCache, "boolean");
  assert.equal(serialized.includes("recordId"), false);
  assert.equal(serialized.includes("fields\":{"), false);
});
