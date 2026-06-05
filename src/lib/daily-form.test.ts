import assert from "node:assert/strict";
import test from "node:test";
import {
  accountSelectOptionLabel,
  accountSelectOptionValue,
  buildDailySubmitPayload,
  canSubmitDailyForm,
  selectedAccountStartCredits,
  selectedAccountIdFromSelectValue,
  type DailyFormAccount,
  type DailySubmitForm
} from "./daily-form";

const sharedAccount: DailyFormAccount = {
  recordId: "rec_shared_001",
  accountName: "其他",
  platform: "LIBTV",
  accountType: "共用测试账号",
  startCredits: 100
};

const personalAccount: DailyFormAccount = {
  recordId: "rec_personal_002",
  accountName: "个人账号",
  platform: "LIBTV",
  accountType: "个人绑定账号",
  startCredits: 260
};

function productionForm(overrides: Partial<DailySubmitForm> = {}): DailySubmitForm {
  return {
    dateMode: "today",
    dailyType: "生产日报",
    selectedAccountId: sharedAccount.recordId,
    changedAccount: false,
    remainingCredits: "80",
    assetCount: "3",
    roughCutSeconds: "120",
    hasIssue: false,
    issueNote: "",
    nonProductionNote: "",
    ...overrides
  };
}

test("account option value uses Feishu account recordId", () => {
  assert.equal(accountSelectOptionValue(sharedAccount), "rec_shared_001");
});

test("account option label is display text, not the option value", () => {
  const label = accountSelectOptionLabel(sharedAccount);

  assert.equal(label, "其他 · 共用测试账号");
  assert.notEqual(label, accountSelectOptionValue(sharedAccount));
});

test("selecting an account stores selectedAccountId as recordId", () => {
  const selectedAccountId = selectedAccountIdFromSelectValue(sharedAccount.recordId);

  assert.equal(selectedAccountId, sharedAccount.recordId);
  assert.notEqual(selectedAccountId, accountSelectOptionLabel(sharedAccount));
});

test("production daily payload submits accountRecordId as recordId", () => {
  const payload = buildDailySubmitPayload(productionForm(), "2026-06-01");

  assert.equal(payload.accountRecordId, sharedAccount.recordId);
});

test("daily submit payload includes selected project fields", () => {
  const payload = buildDailySubmitPayload(
    productionForm({
      selectedProjectName: "XX动画第一季",
      projectType: "正式项目"
    }),
    "2026-06-01"
  );

  assert.equal(payload.projectName, "XX动画第一季");
  assert.equal(payload.projectType, "正式项目");
});

test("daily submit payload keeps project fields empty when project is not selected", () => {
  const payload = buildDailySubmitPayload(productionForm(), "2026-06-01");

  assert.equal(payload.projectName, "");
  assert.equal(payload.projectType, "");
});

test("daily submit payload does not include accountName as submit key", () => {
  const payload = buildDailySubmitPayload(productionForm(), "2026-06-01");

  assert.equal("accountName" in payload, false);
});

test("production daily cannot submit when selectedAccountId is empty", () => {
  assert.equal(
    canSubmitDailyForm(productionForm({ selectedAccountId: "" }), [sharedAccount]),
    false
  );
});

test("different selected accounts show their own startCredits", () => {
  const accounts = [sharedAccount, personalAccount];

  assert.equal(
    selectedAccountStartCredits(accounts, sharedAccount.recordId),
    sharedAccount.startCredits
  );
  assert.equal(
    selectedAccountStartCredits(accounts, personalAccount.recordId),
    personalAccount.startCredits
  );
  assert.notEqual(sharedAccount.startCredits, personalAccount.startCredits);
});

test("generation issue defaults to no", () => {
  assert.equal(productionForm().hasIssue, false);
});

test("selecting generation issue yes submits true", () => {
  const payload = buildDailySubmitPayload(
    productionForm({ hasIssue: true, issueNote: "生成失败" }),
    "2026-06-01"
  );

  assert.equal(payload.hasGenerationIssue, true);
  assert.equal(payload.hasIssue, true);
  assert.equal(payload.issueDescription, "生成失败");
});

test("selecting generation issue no submits false and clears issue note", () => {
  const payload = buildDailySubmitPayload(
    productionForm({ hasIssue: false, issueNote: "不会提交" }),
    "2026-06-01"
  );

  assert.equal(payload.hasGenerationIssue, false);
  assert.equal(payload.hasIssue, false);
  assert.equal(payload.issueDescription, "");
});

test("preparation daily does not need accountRecordId", () => {
  const payload = buildDailySubmitPayload(
    productionForm({
      dailyType: "筹备日报",
      selectedAccountId: "",
      nonProductionNote: "筹备说明"
    }),
    "2026-06-01"
  );

  assert.equal(
    canSubmitDailyForm({ dailyType: "筹备日报", selectedAccountId: "" }, []),
    true
  );
  assert.equal(payload.accountRecordId, undefined);
  assert.equal(JSON.stringify(payload).includes("accountRecordId"), false);
});

test("retrospective daily does not need accountRecordId", () => {
  const payload = buildDailySubmitPayload(
    productionForm({
      dailyType: "复盘日报",
      selectedAccountId: "",
      nonProductionNote: "复盘说明"
    }),
    "2026-06-01"
  );

  assert.equal(
    canSubmitDailyForm({ dailyType: "复盘日报", selectedAccountId: "" }, []),
    true
  );
  assert.equal(payload.accountRecordId, undefined);
  assert.equal(JSON.stringify(payload).includes("accountRecordId"), false);
});
