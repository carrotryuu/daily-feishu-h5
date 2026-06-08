import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(
  join(process.cwd(), "src", "app", "account", "page.tsx"),
  "utf8"
);

test("account page form uses 账号 label and accountName state", () => {
  assert.match(pageSource, /<label>账号<\/label>/);
  assert.match(pageSource, /value=\{form\.accountName\}/);
  assert.match(pageSource, /accountName: event\.target\.value/);
});

test("account page submits accountName in request body", () => {
  assert.match(pageSource, /body: JSON\.stringify\(\{/);
  assert.match(pageSource, /\.\.\.form/);
});

test("account page blocks empty accountName with clear message", () => {
  assert.match(pageSource, /!form\.accountName\.trim\(\)/);
  assert.match(pageSource, /setError\("请填写账号"\)/);
});

test("account table shows fallback when accountName is empty", () => {
  assert.match(pageSource, /account\.accountName \|\| "未填写账号"/);
});

test("account type select only shows shared and personal account types", () => {
  assert.match(pageSource, /<option>\{ACCOUNT_TYPES\.shared\}<\/option>/);
  assert.match(pageSource, /<option>\{ACCOUNT_TYPES\.personal\}<\/option>/);
  assert.doesNotMatch(pageSource, /共享测试账号|共用测试账号|测试账号|共享测试|共用测试/);
});

test("account table shows fallback when accountType is empty", () => {
  assert.match(pageSource, /account\.accountType \|\| "未填写类型"/);
});

test("account page uses account permission error reason", () => {
  assert.match(pageSource, /payload\.reason \|\| payload\.error/);
  assert.match(pageSource, /你没有账号管理权限。/);
});

test("account page hides account form and table before permission data loads", () => {
  assert.match(pageSource, /\{data \? \(/);
});

test("group account manager cannot edit group field in account page", () => {
  assert.match(pageSource, /isGroupAccountManager/);
  assert.match(pageSource, /readOnly=\{isGroupAccountManager\}/);
  assert.match(pageSource, /你只能管理本组账号/);
});
