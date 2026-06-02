import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("/ranking GET does not trigger ranking recompute", () => {
  const route = readFileSync(
    join(process.cwd(), "src/app/api/ranking/route.ts"),
    "utf8"
  );

  assert.equal(route.includes("recomputeRanking"), false);
});

test("/account and /ranking GET routes do not clear records cache", () => {
  const accountRoute = readFileSync(
    join(process.cwd(), "src/app/api/account/route.ts"),
    "utf8"
  );
  const rankingRoute = readFileSync(
    join(process.cwd(), "src/app/api/ranking/route.ts"),
    "utf8"
  );

  assert.equal(accountRoute.includes("invalidateRecordsCache"), false);
  assert.equal(rankingRoute.includes("invalidateRecordsCache"), false);
});
