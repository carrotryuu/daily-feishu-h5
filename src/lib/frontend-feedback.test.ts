import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DAILY_TYPES } from "./constants";
import {
  ACCOUNT_SYNC_WARNING,
  buildDailySuccessDialog,
  buildReviewSuccessDialog,
  hasAccountSyncWarning
} from "./frontend-feedback";

test("daily production submit success dialog uses production copy", () => {
  const dialog = buildDailySuccessDialog(DAILY_TYPES.production, {});

  assert.equal(dialog.title, "提交成功");
  assert.equal(dialog.content, "生产日报已提交，等待导演审核。");
});

test("daily preparation submit success dialog uses generic daily copy", () => {
  const dialog = buildDailySuccessDialog(DAILY_TYPES.preparation, {});

  assert.equal(dialog.title, "提交成功");
  assert.equal(dialog.content, "日报已提交，等待导演审核。");
});

test("review submit success dialog uses review copy", () => {
  const dialog = buildReviewSuccessDialog();

  assert.equal(dialog.title, "审核提交成功");
  assert.equal(dialog.content, "审核结果已保存。");
});

test("daily accountSync skipped or failed shows weak warning but remains success", () => {
  assert.equal(
    buildDailySuccessDialog(DAILY_TYPES.production, {
      accountSync: { status: "skipped", reason: "missing_fields" }
    }).warning,
    ACCOUNT_SYNC_WARNING
  );
  assert.equal(
    buildDailySuccessDialog(DAILY_TYPES.production, {
      accountSync: { status: "failed" }
    }).warning,
    ACCOUNT_SYNC_WARNING
  );
  assert.equal(
    buildDailySuccessDialog(DAILY_TYPES.production, {
      warning: { status: "failed" }
    }).warning,
    ACCOUNT_SYNC_WARNING
  );
});

test("non-production accountSync skip does not show account warning", () => {
  assert.equal(
    hasAccountSyncWarning({
      accountSync: { status: "skipped", reason: "non_production_daily" }
    }),
    false
  );
});

test("daily page keeps failed submit on error state before success dialog", () => {
  const source = readFileSync("src/app/daily/page.tsx", "utf8");

  assert.ok(source.includes('const [successDialog, setSuccessDialog]'));
  assert.ok(source.includes("setError(formatSubmitError(payload));"));
  assert.ok(source.includes("setSuccessDialog(buildDailySuccessDialog"));
  assert.ok(
    source.indexOf("setError(formatSubmitError(payload));") <
      source.indexOf("setSuccessDialog(buildDailySuccessDialog")
  );
});

test("review page keeps failed submit on error state before success dialog", () => {
  const source = readFileSync("src/app/review/page.tsx", "utf8");

  assert.ok(source.includes('const [successDialog, setSuccessDialog]'));
  assert.ok(source.includes('setError(payload.error || "审核提交失败");'));
  assert.ok(source.includes("setSuccessDialog(buildReviewSuccessDialog())"));
  assert.ok(
    source.indexOf('setError(payload.error || "审核提交失败");') <
      source.indexOf("setSuccessDialog(buildReviewSuccessDialog())")
  );
});

test("daily and review submit buttons are disabled while saving", () => {
  const dailySource = readFileSync("src/app/daily/page.tsx", "utf8");
  const reviewSource = readFileSync("src/app/review/page.tsx", "utf8");

  assert.ok(dailySource.includes("disabled={saving || !canSubmitDailyForm"));
  assert.ok(reviewSource.includes("disabled={saving}"));
});
