import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessAccountPage,
  canManageAccount,
  getAccountManageScope
} from "./account-permissions";
import { ACCOUNT_ADMIN_PERMISSIONS, ACCOUNT_STATUS, ACCOUNT_TYPES, ROLES } from "./constants";
import type { Account, Person } from "./types";

test("ordinary animator cannot access account page", () => {
  const user = person({
    role: ROLES.animator,
    accountAdminPermission: ACCOUNT_ADMIN_PERMISSIONS.none
  });

  assert.equal(canAccessAccountPage(user), false);
  assert.equal(getAccountManageScope(user), "none");
});

test("group account admin animator can manage only same normalized group", () => {
  const user = person({
    role: ROLES.animator,
    group: " 金 鑫 组 ",
    accountAdminPermission: ACCOUNT_ADMIN_PERMISSIONS.group
  });

  assert.equal(canAccessAccountPage(user), true);
  assert.equal(getAccountManageScope(user), "group");
  assert.equal(canManageAccount(user, account({ group: "金鑫组" })), true);
  assert.equal(canManageAccount(user, account({ group: "孙导组" })), false);
});

test("global account admin can manage every group", () => {
  const user = person({
    role: ROLES.animator,
    group: "金鑫组",
    accountAdminPermission: ACCOUNT_ADMIN_PERMISSIONS.global
  });

  assert.equal(getAccountManageScope(user), "global");
  assert.equal(canManageAccount(user, account({ group: "孙导组" })), true);
});

test("manager keeps global account management ability", () => {
  const user = person({ role: ROLES.manager, group: "全部" });

  assert.equal(getAccountManageScope(user), "global");
  assert.equal(canManageAccount(user, account({ group: "任意组" })), true);
});

test("director without account permission keeps group account management ability", () => {
  const user = person({ role: ROLES.director, group: "孙导组" });

  assert.equal(getAccountManageScope(user), "group");
  assert.equal(canManageAccount(user, account({ group: "孙导组" })), true);
  assert.equal(canManageAccount(user, account({ group: "马导组" })), false);
});

test("disabled user cannot access account page even with permission", () => {
  const user = person({
    role: ROLES.animator,
    enabled: "否",
    accountAdminPermission: ACCOUNT_ADMIN_PERMISSIONS.global
  });

  assert.equal(canAccessAccountPage(user), false);
});

function person(overrides: Partial<Person> = {}): Person {
  return {
    userId: "user_1",
    name: "用户",
    role: ROLES.animator,
    group: "金鑫组",
    accountAdminPermission: ACCOUNT_ADMIN_PERMISSIONS.none,
    enabled: "是",
    ...overrides
  };
}

function account(overrides: Partial<Account> = {}): Account {
  return {
    group: "金鑫组",
    platform: "LIBTV",
    accountName: "账号",
    accountType: ACCOUNT_TYPES.shared,
    accountStatus: ACCOUNT_STATUS.enabled,
    startCredits: 0,
    ...overrides
  };
}
