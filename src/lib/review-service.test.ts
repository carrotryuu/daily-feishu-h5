import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_TYPES,
  DAILY_STATUS,
  DAILY_TYPES,
  ROLES,
  TABLE_FIELDS,
  YES_NO
} from "./constants";
import {
  buildVisiblePendingDailyRecords,
  submitReviewWithDependencies,
  type ReviewDependencies
} from "./review-service";
import type { BitableRecord, CurrentUser, DailyRecord } from "./types";

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
    nowIso: () => "2026-05-27T12:00:00.000Z"
  };

  const result = await submitReviewWithDependencies(
    director(),
    { recordId: record.recordId, grade: "K2", includeRanking: true },
    dependencies
  );

  assert.equal(result.status, DAILY_STATUS.approved);
  assert.equal(updatedFields?.[TABLE_FIELDS.daily.status], DAILY_STATUS.approved);
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
    nowIso: () => "2026-05-27T12:00:00.000Z"
  };

  await submitReviewWithDependencies(
    director(),
    { recordId: record.recordId, grade: "K2", action: "reject" },
    dependencies
  );

  assert.equal(updatedFields?.[TABLE_FIELDS.daily.status], DAILY_STATUS.rejected);
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
    nowIso: () => "2026-05-27T12:00:00.000Z"
  };

  await submitReviewWithDependencies(
    director(),
    { recordId: record.recordId, grade: "K2", action: "abnormal" },
    dependencies
  );

  assert.equal(updatedFields?.[TABLE_FIELDS.daily.status], DAILY_STATUS.abnormal);
});

test("director cannot see daily records from other groups", () => {
  const rows = buildVisiblePendingDailyRecords(director("A组"), [
    daily("other-group", { group: "B组" })
  ]);

  assert.equal(rows.length, 0);
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
