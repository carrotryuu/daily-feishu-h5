import assert from "node:assert/strict";
import test from "node:test";
import { withApiPerf } from "./perf";

test("performance log includes totalMs and recordsCount", async () => {
  const originalInfo = console.info;
  const logs: unknown[][] = [];
  console.info = (...args: unknown[]) => {
    logs.push(args);
  };

  try {
    await withApiPerf("/api/review", async () => ({ ok: true }));
  } finally {
    console.info = originalInfo;
  }

  assert.equal(logs[0][0], "[Perf] /api/review");
  const payload = logs[0][1] as {
    totalMs?: number;
    recordsCount?: { people?: number; daily?: number };
  };
  assert.equal(typeof payload.totalMs, "number");
  assert.equal(payload.recordsCount?.people, 0);
  assert.equal(payload.recordsCount?.daily, 0);
});
