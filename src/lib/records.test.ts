import assert from "node:assert/strict";
import test from "node:test";
import { mapAccount } from "./records";

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
