import assert from "node:assert/strict";
import test from "node:test";
import {
  ROLES,
  TABLE_FIELDS,
  YES_NO,
  normalizeEnabled,
  normalizeRole
} from "./constants";

test("normalizes role values from people table", () => {
  assert.equal(normalizeRole("动画师"), ROLES.animator);
  assert.equal(normalizeRole("animator"), ROLES.animator);
  assert.equal(normalizeRole("ANIMATOR"), ROLES.animator);
  assert.equal(normalizeRole("打字生"), ROLES.typist);
});

test("normalizes enabled values from people table", () => {
  assert.equal(normalizeEnabled("是"), YES_NO.yes);
  assert.equal(normalizeEnabled("启用"), YES_NO.yes);
  assert.equal(normalizeEnabled("已启用"), YES_NO.yes);
  assert.equal(normalizeEnabled("可用"), YES_NO.yes);
  assert.equal(normalizeEnabled("在职"), YES_NO.yes);
  assert.equal(normalizeEnabled("true"), YES_NO.yes);
  assert.equal(normalizeEnabled("停用"), YES_NO.no);
});

test("daily table includes project field mappings", () => {
  assert.equal(TABLE_FIELDS.daily.projectName, "项目名称");
  assert.equal(TABLE_FIELDS.daily.projectType, "项目类型");
});

test("accounts table uses 账号 for accountName", () => {
  assert.equal(TABLE_FIELDS.accounts.accountName, "账号");
});
