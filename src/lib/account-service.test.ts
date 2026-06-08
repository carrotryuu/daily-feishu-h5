import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { resetBitableCachesForTest } from "./bitable";
import { ACCOUNT_STATUS, ACCOUNT_TYPES, ROLES, TABLE_FIELDS } from "./constants";
import {
  getAccountPageData,
  saveAccount,
  type AccountInput
} from "./account-service";
import type { CurrentUser } from "./types";

test("saveAccount writes accountName to Feishu 账号 field when creating", async (t) => {
  const mock = installAccountFetchMock(t);

  await saveAccount(manager(), accountInput());

  assert.equal(mock.accountCreates[0].fields["账号"], "赵国微生产账号");
  assert.equal(mock.accountCreates[0].fields["类型"], ACCOUNT_TYPES.shared);
  assert.equal("账号名称" in mock.accountCreates[0].fields, false);
  assert.equal("账号类型" in mock.accountCreates[0].fields, false);
});

test("saveAccount writes personal account type to Feishu 类型 field", async (t) => {
  const mock = installAccountFetchMock(t);

  await saveAccount(
    manager(),
    accountInput({
      accountType: ACCOUNT_TYPES.personal,
      userId: "animator_1"
    })
  );

  assert.equal(mock.accountCreates[0].fields["类型"], ACCOUNT_TYPES.personal);
});

test("saveAccount updates accountName to Feishu 账号 field when editing", async (t) => {
  const mock = installAccountFetchMock(t);

  await saveAccount(manager(), accountInput({ recordId: "rec_account_1" }));

  assert.equal(mock.accountUpdates[0].recordId, "rec_account_1");
  assert.equal(mock.accountUpdates[0].fields["账号"], "赵国微生产账号");
  assert.equal(mock.accountUpdates[0].fields["类型"], ACCOUNT_TYPES.shared);
  assert.equal("账号名称" in mock.accountUpdates[0].fields, false);
  assert.equal("账号类型" in mock.accountUpdates[0].fields, false);
});

test("account page data reads accountName from Feishu 账号 field", async (t) => {
  installAccountFetchMock(t);

  const data = await getAccountPageData(manager());

  assert.equal(data.accounts[0].accountName, "赵国微生产账号");
});

test("account page data normalizes legacy shared account types", async (t) => {
  installAccountFetchMock(t, {
    accountTypes: ["共享测试账号", "共用测试账号", "共用账号", "测试账号"]
  });

  const data = await getAccountPageData(manager());

  assert.deepEqual(
    data.accounts.map((account) => account.accountType),
    [
      ACCOUNT_TYPES.shared,
      ACCOUNT_TYPES.shared,
      ACCOUNT_TYPES.shared,
      ACCOUNT_TYPES.shared
    ]
  );
});

test("account page data keeps personal account type", async (t) => {
  installAccountFetchMock(t, { accountType: ACCOUNT_TYPES.personal });

  const data = await getAccountPageData(manager());

  assert.equal(data.accounts[0].accountType, ACCOUNT_TYPES.personal);
});

test("saveAccount rejects empty accountName", async (t) => {
  installAccountFetchMock(t);

  try {
    await saveAccount(manager(), accountInput({ accountName: " " }));
    assert.fail("saveAccount should reject empty accountName");
  } catch (error) {
    assert.ok(error instanceof Response);
    assert.equal(error.status, 400);
    assert.equal(await error.text(), "请填写账号");
  }
});

test("saveAccount rejects legacy shared account type input", async (t) => {
  installAccountFetchMock(t);

  try {
    await saveAccount(
      manager(),
      accountInput({ accountType: "共用测试账号" as never })
    );
    assert.fail("saveAccount should reject legacy accountType");
  } catch (error) {
    assert.ok(error instanceof Response);
    assert.equal(error.status, 400);
    assert.match(
      await error.text(),
      /账号类型只能选择共享账号或个人绑定账号/
    );
  }
});

test("ordinary animator cannot access account page", async (t) => {
  installAccountFetchMock(t);

  await assertRejectsResponse(
    () => getAccountPageData(animator()),
    403,
    /你没有账号管理权限/
  );
});

test("disabled user cannot access account page", async (t) => {
  installAccountFetchMock(t);

  await assertRejectsResponse(
    () => getAccountPageData(disabledGroupAdminAnimator()),
    403,
    /你没有账号管理权限/
  );
});

test("group account admin animator can access account page", async (t) => {
  installAccountFetchMock(t);

  const data = await getAccountPageData(groupAdminAnimator());

  assert.equal(data.accountManageScope, "group");
});

test("group account admin sees only own group accounts", async (t) => {
  installAccountFetchMock(t, {
    accountGroups: ["孙导组", "马导组"]
  });

  const data = await getAccountPageData(groupAdminAnimator());

  assert.deepEqual(
    data.accounts.map((account) => account.group),
    ["孙导组"]
  );
});

test("group account admin can create only own group account", async (t) => {
  const mock = installAccountFetchMock(t);

  await saveAccount(groupAdminAnimator(), accountInput({ group: "孙 导 组" }));

  assert.equal(mock.accountCreates[0].fields["所属小组"], "孙导组");
});

test("group account admin cannot create another group account", async (t) => {
  const mock = installAccountFetchMock(t);

  await assertRejectsResponse(
    () => saveAccount(groupAdminAnimator(), accountInput({ group: "马导组" })),
    403,
    /只能管理本组账号/
  );
  assert.equal(mock.accountCreates.length, 0);
});

test("group account admin can edit own group account", async (t) => {
  const mock = installAccountFetchMock(t);

  await saveAccount(
    groupAdminAnimator(),
    accountInput({ recordId: "rec_account_1", group: "孙导组" })
  );

  assert.equal(mock.accountUpdates[0].recordId, "rec_account_1");
});

test("group account admin cannot edit another group account", async (t) => {
  const mock = installAccountFetchMock(t, {
    accountGroups: ["孙导组", "马导组"]
  });

  await assertRejectsResponse(
    () =>
      saveAccount(
        groupAdminAnimator(),
        accountInput({ recordId: "rec_account_2", group: "孙导组" })
      ),
    403,
    /只能管理本组账号/
  );
  assert.equal(mock.accountUpdates.length, 0);
});

test("group account admin cannot move account to another group", async (t) => {
  const mock = installAccountFetchMock(t);

  await assertRejectsResponse(
    () =>
      saveAccount(
        groupAdminAnimator(),
        accountInput({ recordId: "rec_account_1", group: "马导组" })
      ),
    403,
    /只能管理本组账号/
  );
  assert.equal(mock.accountUpdates.length, 0);
});

test("group account admin can disable own group account", async (t) => {
  const mock = installAccountFetchMock(t);

  await saveAccount(
    groupAdminAnimator(),
    accountInput({
      recordId: "rec_account_1",
      group: "孙导组",
      accountStatus: ACCOUNT_STATUS.disabled
    })
  );

  assert.equal(mock.accountUpdates[0].fields["账号状态"], ACCOUNT_STATUS.disabled);
});

test("global account admin can view and edit every group", async (t) => {
  const mock = installAccountFetchMock(t, {
    accountGroups: ["孙导组", "马导组"]
  });

  const data = await getAccountPageData(globalAdminAnimator());
  await saveAccount(
    globalAdminAnimator(),
    accountInput({ recordId: "rec_account_2", group: "马导组" })
  );

  assert.equal(data.accountManageScope, "global");
  assert.deepEqual(
    data.accounts.map((account) => account.group),
    ["孙导组", "马导组"]
  );
  assert.equal(mock.accountUpdates[0].recordId, "rec_account_2");
});

test("manager keeps global account management ability", async (t) => {
  installAccountFetchMock(t, {
    accountGroups: ["孙导组", "马导组"]
  });

  const data = await getAccountPageData(manager());

  assert.equal(data.accountManageScope, "global");
  assert.equal(data.accounts.length, 2);
});

test("director keeps existing own group account management ability", async (t) => {
  installAccountFetchMock(t, {
    accountGroups: ["孙导组", "马导组"]
  });

  const data = await getAccountPageData(director());

  assert.equal(data.accountManageScope, "group");
  assert.deepEqual(
    data.accounts.map((account) => account.group),
    ["孙导组"]
  );
});

function installAccountFetchMock(
  t: TestContext,
  options: {
    accountType?: string;
    accountTypes?: string[];
    accountGroups?: string[];
  } = {}
) {
  resetBitableCachesForTest();
  const originalFetch = globalThis.fetch;
  const accountCreates: Array<{ fields: Record<string, unknown> }> = [];
  const accountUpdates: Array<{
    recordId: string;
    fields: Record<string, unknown>;
  }> = [];
  const accountTypes = options.accountTypes ?? [
    options.accountType ?? ACCOUNT_TYPES.personal
  ];
  const accountGroups = options.accountGroups ?? accountTypes.map(() => "孙导组");
  const rowCount = Math.max(accountTypes.length, accountGroups.length);

  process.env.FEISHU_APP_ID = "app_id";
  process.env.FEISHU_APP_SECRET = "app_secret";
  process.env.FEISHU_BASE_APP_TOKEN = "base_app_token";
  process.env.APP_URL = "http://localhost:3000";
  process.env.CRON_SECRET = "cron_secret";
  process.env.FEISHU_TABLE_PEOPLE = "tbl_people";
  process.env.FEISHU_TABLE_ACCOUNTS = "tbl_accounts";

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";

    if (url.includes("/tenant_access_token/internal")) {
      return Response.json({
        code: 0,
        tenant_access_token: "tenant_token",
        expire: 7200
      });
    }

    if (url.includes("/tables/tbl_people/fields")) {
      return Response.json({
        code: 0,
        data: {
          items: [
            field("fld_people_user", TABLE_FIELDS.people.userId),
            field("fld_people_name", TABLE_FIELDS.people.name),
            field("fld_people_role", TABLE_FIELDS.people.role),
            field("fld_people_group", TABLE_FIELDS.people.group),
            field(
              "fld_people_account_admin_permission",
              TABLE_FIELDS.people.accountAdminPermission
            ),
            field("fld_people_enabled", TABLE_FIELDS.people.enabled)
          ],
          has_more: false
        }
      });
    }

    if (url.includes("/tables/tbl_people/records")) {
      return Response.json({
        code: 0,
        data: {
          items: [
            {
              record_id: "person_animator",
              fields: {
                [TABLE_FIELDS.people.userId]: "animator_1",
                [TABLE_FIELDS.people.name]: "赵国微",
                [TABLE_FIELDS.people.role]: ROLES.animator,
                [TABLE_FIELDS.people.group]: "孙导组",
                [TABLE_FIELDS.people.enabled]: "是"
              }
            }
          ],
          has_more: false
        }
      });
    }

    if (url.includes("/tables/tbl_accounts/fields")) {
      return Response.json({
        code: 0,
        data: {
          items: [
            field("fld_account_group", TABLE_FIELDS.accounts.group),
            field("fld_account_platform", TABLE_FIELDS.accounts.platform),
            field("fld_account_name", TABLE_FIELDS.accounts.accountName),
            field("fld_account_type", TABLE_FIELDS.accounts.accountType),
            field("fld_account_status", TABLE_FIELDS.accounts.accountStatus),
            field("fld_account_animator", TABLE_FIELDS.accounts.animatorName),
            field("fld_account_user", TABLE_FIELDS.accounts.userId),
            field("fld_account_start", TABLE_FIELDS.accounts.startCredits)
          ],
          has_more: false
        }
      });
    }

    if (url.includes("/tables/tbl_accounts/records")) {
      if (method === "POST") {
        accountCreates.push({ fields: JSON.parse(String(init?.body)).fields });
        return Response.json({
          code: 0,
          data: { record: { record_id: "rec_account_created", fields: {} } }
        });
      }

      if (method === "PUT") {
        accountUpdates.push({
          recordId: url.split("/").pop() || "",
          fields: JSON.parse(String(init?.body)).fields
        });
        return Response.json({
          code: 0,
          data: { record: { record_id: "rec_account_1", fields: {} } }
        });
      }

      return Response.json({
        code: 0,
        data: {
          items: Array.from({ length: rowCount }, (_, index) => ({
            record_id: `rec_account_${index + 1}`,
            fields: {
              [TABLE_FIELDS.accounts.group]: accountGroups[index] ?? "孙导组",
              [TABLE_FIELDS.accounts.platform]: "LIBTV",
              [TABLE_FIELDS.accounts.accountName]: "赵国微生产账号",
              [TABLE_FIELDS.accounts.accountType]:
                accountTypes[index] ?? accountTypes[0] ?? ACCOUNT_TYPES.personal,
              [TABLE_FIELDS.accounts.accountStatus]: ACCOUNT_STATUS.enabled,
              [TABLE_FIELDS.accounts.animatorName]: "赵国微",
              [TABLE_FIELDS.accounts.userId]: "animator_1",
              [TABLE_FIELDS.accounts.startCredits]: 100
            }
          })),
          has_more: false
        }
      });
    }

    throw new Error(`Unexpected fetch ${method} ${url}`);
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetBitableCachesForTest();
    delete process.env.FEISHU_TABLE_PEOPLE;
    delete process.env.FEISHU_TABLE_ACCOUNTS;
  });

  return { accountCreates, accountUpdates };
}

function field(fieldId: string, fieldName: string) {
  return { field_id: fieldId, field_name: fieldName };
}

async function assertRejectsResponse(
  fn: () => Promise<unknown>,
  status: number,
  message: RegExp
) {
  try {
    await fn();
    assert.fail("expected request to reject");
  } catch (error) {
    assert.ok(error instanceof Response);
    assert.equal(error.status, status);
    assert.match(await error.text(), message);
  }
}

function manager(): CurrentUser {
  return {
    sessionUserId: "manager_1",
    sessionSource: "dev_open_id",
    person: {
      userId: "manager_1",
      name: "制片",
      role: ROLES.manager,
      group: "全部",
      accountAdminPermission: "无",
      enabled: "是"
    }
  };
}

function director(): CurrentUser {
  return {
    sessionUserId: "director_1",
    sessionSource: "dev_open_id",
    person: {
      userId: "director_1",
      name: "导演",
      role: ROLES.director,
      group: "孙导组",
      accountAdminPermission: "无",
      enabled: "是"
    }
  };
}

function animator(): CurrentUser {
  return {
    sessionUserId: "animator_1",
    sessionSource: "dev_open_id",
    person: {
      userId: "animator_1",
      name: "动画师",
      role: ROLES.animator,
      group: "孙导组",
      accountAdminPermission: "无",
      enabled: "是"
    }
  };
}

function groupAdminAnimator(): CurrentUser {
  return {
    sessionUserId: "animator_1",
    sessionSource: "dev_open_id",
    person: {
      userId: "animator_1",
      name: "动画师",
      role: ROLES.animator,
      group: "孙导组",
      accountAdminPermission: "本组账号管理员",
      enabled: "是"
    }
  };
}

function globalAdminAnimator(): CurrentUser {
  return {
    sessionUserId: "animator_1",
    sessionSource: "dev_open_id",
    person: {
      userId: "animator_1",
      name: "动画师",
      role: ROLES.animator,
      group: "孙导组",
      accountAdminPermission: "全局账号管理员",
      enabled: "是"
    }
  };
}

function disabledGroupAdminAnimator(): CurrentUser {
  return {
    sessionUserId: "animator_1",
    sessionSource: "dev_open_id",
    person: {
      userId: "animator_1",
      name: "动画师",
      role: ROLES.animator,
      group: "孙导组",
      accountAdminPermission: "本组账号管理员",
      enabled: "否"
    }
  };
}

function accountInput(overrides: Partial<AccountInput> = {}): AccountInput {
  return {
    group: "孙导组",
    platform: "LIBTV",
    accountName: "赵国微生产账号",
    accountType: ACCOUNT_TYPES.shared,
    accountStatus: ACCOUNT_STATUS.enabled,
    startCredits: 100,
    ...overrides
  };
}
