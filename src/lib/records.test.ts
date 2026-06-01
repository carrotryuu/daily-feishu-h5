import assert from "node:assert/strict";
import test from "node:test";
import { DAILY_STATUS, DAILY_TYPES, TABLE_FIELDS, YES_NO } from "./constants";
import { mapAccount, mapDaily, toDailyFields } from "./records";

test("maps account startCredits from supported Feishu field aliases", () => {
  assert.equal(mapAccount({ 起始积分: 11 }).startCredits, 11);
  assert.equal(mapAccount({ 初始积分: 22 }).startCredits, 22);
  assert.equal(mapAccount({ 账号起始积分: 33 }).startCredits, 33);
  assert.equal(mapAccount({ startCredits: 44 }).startCredits, 44);
});

test("maps account bound user and name from supported Feishu aliases", () => {
  const account = mapAccount({
    绑定用户ID: "u_current",
    绑定人员: "张三"
  });

  assert.equal(account.userId, "u_current");
  assert.equal(account.animatorName, "张三");
});

test("maps other period content from daily fields", () => {
  const daily = mapDaily({
    [TABLE_FIELDS.daily.nonProductionNote]: "筹备说明"
  });

  assert.equal(daily.dailyType, DAILY_TYPES.other);
  assert.equal(daily.nonProductionNote, "筹备说明");
});

test("infers other daily type when type field is empty but other period content exists", () => {
  const daily = mapDaily({
    [TABLE_FIELDS.daily.nonProductionNote]: "历史非生产说明"
  });

  assert.equal(daily.dailyType, DAILY_TYPES.other);
  assert.equal(daily.nonProductionNote, "历史非生产说明");
});

test("maps status and group when Feishu returns option-like objects", () => {
  const daily = mapDaily({
    [TABLE_FIELDS.daily.status]: { text: DAILY_STATUS.pending },
    [TABLE_FIELDS.daily.group]: { text: "A组" }
  });

  assert.equal(daily.status, DAILY_STATUS.pending);
  assert.equal(daily.group, "A组");
});

test("writes other period content without requiring daily type field", () => {
  const fields = toDailyFields({
    dailyType: DAILY_TYPES.retrospective,
    date: "2026-05-27",
    userId: "animator_1",
    name: "动画师",
    group: "A组",
    changedAccount: YES_NO.no,
    account: "",
    platform: "",
    accountType: "",
    previousCredits: 0,
    newAccountStartCredits: 0,
    remainingCredits: 0,
    consumedCredits: 0,
    assetCount: 0,
    roughCutSeconds: 0,
    hasIssue: YES_NO.no,
    issueNote: "",
    nonProductionNote: "复盘说明",
    status: DAILY_STATUS.pending,
    includeRanking: YES_NO.no,
    month: "2026-05",
    submittedAt: "2026-05-27T10:00:00.000Z"
  });

  assert.equal("日报类型" in fields, false);
  assert.equal(fields[TABLE_FIELDS.daily.nonProductionNote], "复盘说明");
});
