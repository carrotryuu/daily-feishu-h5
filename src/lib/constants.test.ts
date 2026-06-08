import assert from "node:assert/strict";
import test from "node:test";
import {
  ROLES,
  TABLE_FIELDS,
  YES_NO,
  normalizeAccountAdminPermission,
  normalizeAccountType,
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

test("accounts table uses 类型 for accountType", () => {
  assert.equal(TABLE_FIELDS.accounts.accountType, "类型");
});

test("people table includes account admin permission field", () => {
  assert.equal(TABLE_FIELDS.people.accountAdminPermission, "账号管理权限");
});

test("normalizes account admin permission values", () => {
  assert.equal(normalizeAccountAdminPermission(""), "无");
  assert.equal(normalizeAccountAdminPermission("无"), "无");
  assert.equal(
    normalizeAccountAdminPermission("本组账号管理员"),
    "本组账号管理员"
  );
  assert.equal(
    normalizeAccountAdminPermission("全局账号管理员"),
    "全局账号管理员"
  );
  assert.equal(normalizeAccountAdminPermission("未知"), "");
});

test("normalizes legacy shared account types", () => {
  assert.equal(normalizeAccountType("共享账号"), "共享账号");
  assert.equal(normalizeAccountType("共享测试账号"), "共享账号");
  assert.equal(normalizeAccountType("共用测试账号"), "共享账号");
  assert.equal(normalizeAccountType("共用账号"), "共享账号");
  assert.equal(normalizeAccountType("测试账号"), "共享账号");
  assert.equal(normalizeAccountType("个人绑定账号"), "个人绑定账号");
  assert.equal(normalizeAccountType(""), "");
  assert.equal(normalizeAccountType("未知类型"), "");
});
