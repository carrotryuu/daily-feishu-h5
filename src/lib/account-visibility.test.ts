import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_STATUS, ACCOUNT_TYPES, ROLES, YES_NO } from "./constants";
import {
  buildDailyAccountsDiagnostics,
  filterDailyAccountsForUser
} from "./account-visibility";
import type { Account, BitableRecord, CurrentUser } from "./types";

const currentUser: CurrentUser = {
  sessionUserId: "u_current",
  sessionSource: "dev_open_id",
  person: {
    userId: "u_current",
    name: "张三",
    role: ROLES.animator,
    group: "A组",
    enabled: YES_NO.yes
  }
};

function account(
  recordId: string,
  fields: Partial<Account>
): BitableRecord<Account> {
  return {
    recordId,
    fields: {
      group: "A组",
      platform: "LIBTV",
      accountName: recordId,
      accountType: ACCOUNT_TYPES.shared,
      accountStatus: ACCOUNT_STATUS.enabled,
      startCredits: 0,
      ...fields
    }
  };
}

test("shared enabled account in same group is visible on daily page", () => {
  const visible = filterDailyAccountsForUser(currentUser, [
    account("rec_shared", {
      accountName: "共用账号",
      accountType: ACCOUNT_TYPES.shared,
      group: "A组"
    })
  ]);

  assert.deepEqual(
    visible.map((record) => record.recordId),
    ["rec_shared"]
  );
});

test("personal account bound to current userId is visible", () => {
  const visible = filterDailyAccountsForUser(currentUser, [
    account("rec_personal_user", {
      accountType: ACCOUNT_TYPES.personal,
      group: "",
      userId: "u_current",
      animatorName: ""
    })
  ]);

  assert.deepEqual(
    visible.map((record) => record.recordId),
    ["rec_personal_user"]
  );
});

test("personal account bound to current name is visible", () => {
  const visible = filterDailyAccountsForUser(currentUser, [
    account("rec_personal_name", {
      accountType: ACCOUNT_TYPES.personal,
      group: "其他组",
      userId: "",
      animatorName: "张三"
    })
  ]);

  assert.deepEqual(
    visible.map((record) => record.recordId),
    ["rec_personal_name"]
  );
});

test("personal account is not filtered out only because group is empty", () => {
  const visible = filterDailyAccountsForUser(currentUser, [
    account("rec_empty_group", {
      accountType: ACCOUNT_TYPES.personal,
      group: "",
      userId: "u_current"
    })
  ]);

  assert.equal(visible.length, 1);
});

test("daily account diagnostics include visible and filtered reasons", () => {
  const diagnostics = buildDailyAccountsDiagnostics(currentUser, [
    account("rec_visible", {
      accountType: ACCOUNT_TYPES.personal,
      userId: "u_current",
      startCredits: 66
    }),
    account("rec_filtered", {
      accountType: ACCOUNT_TYPES.personal,
      userId: "u_other",
      startCredits: 88
    })
  ]);

  assert.equal(diagnostics.totalAccounts, 2);
  assert.deepEqual(diagnostics.visibleAccounts.map((item) => item.reason), [
    "personal_bound_user_match"
  ]);
  assert.deepEqual(diagnostics.filteredAccounts.map((item) => item.reason), [
    "filtered_personal_not_bound"
  ]);
});
