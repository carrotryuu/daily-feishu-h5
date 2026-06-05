import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_STATUS,
  ACCOUNT_TYPES,
  DAILY_STATUS,
  DAILY_TYPES,
  PLATFORM_OPTIONS,
  ROLES,
  TABLE_FIELDS,
  YES_NO
} from "./constants";
import {
  buildProductionDailyRecord,
  findPreviousCredits,
  submitDaily
} from "./daily-service";
import { listRecords, resetBitableCachesForTest } from "./bitable";
import { calculateConsumedCredits, defaultDailyDecision } from "./domain";
import { toDailyFields } from "./records";
import type { Account, BitableRecord, DailyRecord } from "./types";
import type { CurrentUser } from "./types";
import type { TestContext } from "node:test";

const accountA: Account = {
  group: "A组",
  platform: PLATFORM_OPTIONS[0],
  accountName: "账号A",
  accountType: ACCOUNT_TYPES.personal,
  accountStatus: ACCOUNT_STATUS.enabled,
  startCredits: 7823
};

const accountB: Account = {
  ...accountA,
  accountName: "账号B",
  startCredits: 9000
};

const user: CurrentUser = {
  sessionUserId: "animator_1",
  sessionSource: "dev_open_id",
  person: {
    userId: "animator_1",
    name: "赵国微",
    role: ROLES.animator,
    group: "孙导组",
    enabled: YES_NO.yes
  }
};

function daily(
  recordId: string,
  overrides: Partial<DailyRecord> = {}
): BitableRecord<DailyRecord> {
  return {
    recordId,
    fields: {
      dailyType: DAILY_TYPES.production,
      date: "2026-05-30",
      userId: "animator_1",
      name: "动画师",
      group: "A组",
      changedAccount: YES_NO.no,
      account: "账号A",
      platform: PLATFORM_OPTIONS[0],
      accountType: ACCOUNT_TYPES.personal,
      previousCredits: 9000,
      newAccountStartCredits: 0,
      remainingCredits: 7823,
      consumedCredits: 1177,
      assetCount: 1,
      roughCutSeconds: 60,
      hasIssue: YES_NO.no,
      issueNote: "",
      nonProductionNote: "",
      status: DAILY_STATUS.approved,
      includeRanking: YES_NO.yes,
      month: "2026-05",
      submittedAt: "2026-05-30T10:00:00.000Z",
      ...overrides
    }
  };
}

test("no previous daily uses account start credits as previous credits", () => {
  const previousCredits = findPreviousCredits([], accountA, "2026-06-01");
  const consumedCredits = calculateConsumedCredits({
    changedAccount: false,
    previousCredits,
    newAccountStartCredits: 0,
    remainingCredits: 3000
  });

  assert.equal(previousCredits, 7823);
  assert.equal(consumedCredits, 4823);
});

test("previous credits are matched by current account name only", () => {
  const previousCredits = findPreviousCredits(
    [
      daily("a-old", { account: "账号A", remainingCredits: 7823 }),
      daily("b-old", { account: "账号B", remainingCredits: 1111 })
    ],
    accountB,
    "2026-06-01"
  );

  assert.equal(previousCredits, 1111);
});

test("previous credits prefer account recordId when it is stored in daily account field", () => {
  const previousCredits = findPreviousCredits(
    [
      daily("name-match", { account: "账号B", remainingCredits: 1111 }),
      daily("record-id-match", {
        account: "同名账号",
        accountRecordId: "rec_account_b",
        remainingCredits: 2222
      })
    ],
    accountB,
    "2026-06-01",
    "rec_account_b"
  );

  assert.equal(previousCredits, 2222);
});

test("negative consumed credits keep daily pending and excluded from ranking", () => {
  const consumedCredits = calculateConsumedCredits({
    changedAccount: false,
    previousCredits: 1000,
    newAccountStartCredits: 0,
    remainingCredits: 3000
  });
  const decision = defaultDailyDecision({
    consumedCredits,
    accountType: ACCOUNT_TYPES.personal,
    dailyType: DAILY_TYPES.production,
    date: "2026-06-01"
  });

  assert.equal(consumedCredits, -2000);
  assert.equal(decision.status, DAILY_STATUS.pending);
  assert.equal(decision.includeRanking, false);
});

test("daily fields write consumed credits instead of remaining credits", () => {
  const fields = toDailyFields({
    ...daily("write").fields,
    previousCredits: 7823,
    remainingCredits: 3000,
    consumedCredits: 4823
  });

  assert.equal(fields["今日积分消耗"], 4823);
  assert.notEqual(fields["今日积分消耗"], fields["今日剩余积分"]);
});

test("production daily record keeps account, account type, and platform", () => {
  const record = buildProductionDailyRecord({
    user,
    accountRecordId: "rec_account_a",
    account: {
      ...accountA,
      accountName: "赵国微生产账号",
      accountType: ACCOUNT_TYPES.personal,
      platform: "LIBTV"
    },
    dailyType: DAILY_TYPES.production,
    date: "2026-06-01",
    changedAccount: false,
    previousCredits: 40000,
    newAccountStartCredits: 0,
    remainingCredits: 30000,
    consumedCredits: 10000,
    assetCount: 3,
    roughCutSeconds: 120,
    hasIssue: false,
    issueNote: "",
    includeRanking: true
  });

  assert.equal(record.accountRecordId, "rec_account_a");
  assert.equal(record.account, "赵国微生产账号");
  assert.equal(record.accountType, ACCOUNT_TYPES.personal);
  assert.equal(record.platform, "LIBTV");
  assert.equal(record.group, "孙导组");
  assert.equal(record.consumedCredits, 10000);
});

test("personal account submit syncs account current remaining credits from current remainingCredits", async (t) => {
  const mock = installDailySubmitFetchMock(t);

  const result = await submitDaily(user, productionInput({ remainingCredits: 3000 }));

  assert.equal(result.recordId, "rec_daily_created");
  assert.equal(result.accountSync.status, "success");
  assert.equal(mock.accountUpdates.length, 1);
  assert.equal(mock.accountUpdates[0].recordId, "rec_account_a");
  assert.equal(
    mock.accountUpdates[0].fields[TABLE_FIELDS.accounts.currentRemainingCredits],
    3000
  );
  assert.notEqual(
    mock.accountUpdates[0].fields[TABLE_FIELDS.accounts.currentRemainingCredits],
    4823
  );
  assert.equal(
    mock.accountUpdates[0].fields[TABLE_FIELDS.accounts.lastUser],
    user.person.name
  );
});

test("daily submit writes project name and project type to daily fields", async (t) => {
  const mock = installDailySubmitFetchMock(t);

  await submitDaily(
    user,
    productionInput({
      projectName: "XX动画第一季",
      projectType: "正式项目"
    })
  );

  assert.equal(mock.dailyCreates.length, 1);
  assert.equal(
    mock.dailyCreates[0].fields[TABLE_FIELDS.daily.projectName],
    "XX动画第一季"
  );
  assert.equal(
    mock.dailyCreates[0].fields[TABLE_FIELDS.daily.projectType],
    "正式项目"
  );
});

test("daily submit succeeds when project is not selected and writes empty project fields", async (t) => {
  const mock = installDailySubmitFetchMock(t);

  const result = await submitDaily(user, productionInput());

  assert.equal(result.recordId, "rec_daily_created");
  assert.equal(mock.dailyCreates.length, 1);
  assert.equal(mock.dailyCreates[0].fields[TABLE_FIELDS.daily.projectName], "");
  assert.equal(mock.dailyCreates[0].fields[TABLE_FIELDS.daily.projectType], "");
});

test("shared account syncs same-day minimum remaining credits", async (t) => {
  const shared = sharedAccount();
  const mock = installDailySubmitFetchMock(t, {
    account: shared,
    dailyRecords: [
      daily("same-day-a", {
        accountRecordId: "rec_account_a",
        account: shared.accountName,
        accountType: ACCOUNT_TYPES.shared,
        userId: "animator_2",
        name: "A",
        date: "2026-06-01",
        remainingCredits: 8000
      })
    ]
  });

  const result = await submitDaily(
    user,
    productionInput({ remainingCredits: 6000 })
  );

  assert.equal(result.accountSync.status, "success");
  assert.equal(result.accountSync.syncedCurrentRemainingCredits, 6000);
  assert.equal(
    mock.accountUpdates[0].fields[TABLE_FIELDS.accounts.currentRemainingCredits],
    6000
  );
});

test("shared account A=8000 B=6000 C=7500 syncs 6000", async (t) => {
  const shared = sharedAccount();
  const mock = installDailySubmitFetchMock(t, {
    account: shared,
    dailyRecords: [
      daily("same-day-a", {
        accountRecordId: "rec_account_a",
        account: shared.accountName,
        accountType: ACCOUNT_TYPES.shared,
        userId: "animator_2",
        name: "A",
        date: "2026-06-01",
        remainingCredits: 8000
      }),
      daily("same-day-b", {
        accountRecordId: "rec_account_a",
        account: shared.accountName,
        accountType: ACCOUNT_TYPES.shared,
        userId: "animator_3",
        name: "B",
        date: "2026-06-01",
        remainingCredits: 6000
      })
    ]
  });

  const result = await submitDaily(
    user,
    productionInput({ remainingCredits: 7500 })
  );

  assert.equal(result.accountSync.status, "success");
  assert.equal(result.accountSync.syncedCurrentRemainingCredits, 6000);
  assert.equal(
    mock.accountUpdates[0].fields[TABLE_FIELDS.accounts.currentRemainingCredits],
    6000
  );
  assert.equal(mock.accountUpdates[0].fields[TABLE_FIELDS.accounts.lastUser], "赵国微");
  assert.equal(mock.accountUpdates[0].fields[TABLE_FIELDS.accounts.lastDailyId], "rec_daily_created");
});

test("shared account last user can be overwritten by later submit without blocking visibility", async (t) => {
  const shared = sharedAccount({ lastUser: "其他动画师" });
  const mock = installDailySubmitFetchMock(t, { account: shared });

  const result = await submitDaily(
    user,
    productionInput({ remainingCredits: 7500 })
  );

  assert.equal(result.accountSync.status, "success");
  assert.equal(mock.accountUpdates.length, 1);
  assert.equal(mock.accountUpdates[0].fields[TABLE_FIELDS.accounts.lastUser], "赵国微");
});

test("successful account sync clears accounts records cache", async (t) => {
  const mock = installDailySubmitFetchMock(t);

  await listRecords("accounts");
  await submitDaily(user, productionInput({ remainingCredits: 3000 }));
  await listRecords("accounts");

  assert.equal(mock.counts.accountRecords, 2);
  assert.equal(mock.accountUpdates.length, 1);
});

test("missing account current remaining credits field skips sync without blocking daily submit", async (t) => {
  const mock = installDailySubmitFetchMock(t, {
    missingAccountFields: [TABLE_FIELDS.accounts.currentRemainingCredits]
  });

  const result = await submitDaily(user, productionInput({ remainingCredits: 3000 }));

  assert.equal(result.recordId, "rec_daily_created");
  assert.equal(result.accountSync.status, "skipped");
  assert.deepEqual(result.accountSync.missingFields, [
    TABLE_FIELDS.accounts.currentRemainingCredits
  ]);
  assert.equal(mock.accountUpdates.length, 0);
});

test("failed account sync returns warning without blocking daily submit", async (t) => {
  const mock = installDailySubmitFetchMock(t, { failAccountUpdate: true });

  const result = await submitDaily(user, productionInput({ remainingCredits: 3000 }));

  assert.equal(result.recordId, "rec_daily_created");
  assert.equal(result.accountSync.status, "failed");
  assert.equal(result.accountSync.reason, "ACCOUNT_SYNC_FAILED");
  assert.equal(result.warning?.status, "failed");
  assert.equal(mock.accountUpdates.length, 1);
});

test("non-production daily submit does not update account table", async (t) => {
  const mock = installDailySubmitFetchMock(t);

  const result = await submitDaily(user, {
    date: "2026-06-01",
    dateMode: "today",
    reportType: DAILY_TYPES.preparation,
    changedAccount: false,
    remainingCredits: 0,
    assetCount: 0,
    roughCutSeconds: 0,
    hasIssue: false,
    nonProductionNote: "准备工作"
  });

  assert.equal(result.recordId, "rec_daily_created");
  assert.equal(result.accountSync.status, "skipped");
  assert.equal(result.accountSync.reason, "non_production_daily");
  assert.equal(mock.accountUpdates.length, 0);
});

test("personal previous credits prefer account current remaining credits", () => {
  const previousCredits = findPreviousCredits(
    [
      daily("history", {
        accountRecordId: "rec_account_a",
        remainingCredits: 2222
      })
    ],
    {
      ...accountA,
      currentRemainingCredits: 9999
    },
    "2026-06-01",
    "rec_account_a"
  );

  assert.equal(previousCredits, 9999);
});

test("shared account previous credits use account current remaining credits", () => {
  const previousCredits = findPreviousCredits(
    [
      daily("history", {
        accountRecordId: "rec_account_a",
        remainingCredits: 2222
      })
    ],
    sharedAccount({ currentRemainingCredits: 8888 }),
    "2026-06-01",
    "rec_account_a"
  );

  assert.equal(previousCredits, 8888);
});

test("shared account submit is excluded from ranking", async (t) => {
  installDailySubmitFetchMock(t, { account: sharedAccount() });

  const result = await submitDaily(user, productionInput({ remainingCredits: 7500 }));

  assert.equal(result.daily.includeRanking, YES_NO.no);
});

function productionInput(overrides: Partial<Parameters<typeof submitDaily>[1]> = {}) {
  return {
    date: "2026-06-01",
    dateMode: "today" as const,
    reportType: DAILY_TYPES.production,
    accountRecordId: "rec_account_a",
    changedAccount: false,
    remainingCredits: 3000,
    assetCount: 3,
    roughCutSeconds: 120,
    hasIssue: false,
    ...overrides
  };
}

function sharedAccount(overrides: Partial<Account> = {}): Account {
  return {
    ...accountA,
    accountName: "共用测试账号A",
    accountType: ACCOUNT_TYPES.shared,
    group: user.person.group,
    userId: "",
    animatorName: "",
    startCredits: 10000,
    ...overrides
  };
}

function installDailySubmitFetchMock(
  t: TestContext,
  options: {
    account?: Account;
    dailyRecords?: BitableRecord<DailyRecord>[];
    missingAccountFields?: string[];
    failAccountUpdate?: boolean;
  } = {}
) {
  resetBitableCachesForTest();
  const originalFetch = globalThis.fetch;
  const accountUpdates: Array<{ recordId: string; fields: Record<string, unknown> }> =
    [];
  const dailyCreates: Array<{ fields: Record<string, unknown> }> = [];
  const counts = {
    accountRecords: 0
  };
  const mockAccount = options.account ?? {
    ...accountA,
    animatorName: user.person.name,
    userId: user.person.userId,
    currentRemainingCredits: 9999
  };
  const mockDailyRecords = options.dailyRecords ?? [];

  process.env.FEISHU_APP_ID = "app_id";
  process.env.FEISHU_APP_SECRET = "app_secret";
  process.env.FEISHU_BASE_APP_TOKEN = "app_token";
  process.env.APP_URL = "http://localhost:3000";
  process.env.CRON_SECRET = "cron_secret";
  process.env.FEISHU_TABLE_DAILY = "tbl_daily";
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

    if (url.includes("/tables/tbl_accounts/fields")) {
      return Response.json({
        code: 0,
        data: {
          items: accountFieldNames(options.missingAccountFields).map(
            (fieldName, index) => ({
              field_id: `fld_account_${index}`,
              field_name: fieldName
            })
          ),
          has_more: false
        }
      });
    }

    if (url.includes("/tables/tbl_daily/fields")) {
      return Response.json({
        code: 0,
        data: {
          items: Object.values(TABLE_FIELDS.daily)
            .filter((fieldName) => typeof fieldName === "string")
            .map((fieldName, index) => ({
              field_id: `fld_daily_${index}`,
              field_name: fieldName
            })),
          has_more: false
        }
      });
    }

    if (url.includes("/tables/tbl_accounts/records")) {
      if (method === "PUT") {
        accountUpdates.push({
          recordId: url.split("/").pop() || "",
          fields: JSON.parse(String(init?.body)).fields
        });
        if (options.failAccountUpdate) {
          return Response.json(
            {
              code: 1254000,
              msg: "account update failed",
              data: {}
            },
            { status: 500 }
          );
        }
        return Response.json({
          code: 0,
          data: { record: { record_id: "rec_account_a", fields: {} } }
        });
      }

      counts.accountRecords += 1;
      return Response.json({
        code: 0,
        data: {
          items: [
            {
              record_id: "rec_account_a",
              fields: {
                [TABLE_FIELDS.accounts.group]: mockAccount.group,
                [TABLE_FIELDS.accounts.platform]: mockAccount.platform,
                [TABLE_FIELDS.accounts.accountName]: mockAccount.accountName,
                [TABLE_FIELDS.accounts.accountType]: mockAccount.accountType,
                [TABLE_FIELDS.accounts.accountStatus]: mockAccount.accountStatus,
                [TABLE_FIELDS.accounts.animatorName]: mockAccount.animatorName,
                [TABLE_FIELDS.accounts.userId]: mockAccount.userId,
                [TABLE_FIELDS.accounts.startCredits]: mockAccount.startCredits,
                [TABLE_FIELDS.accounts.currentRemainingCredits]:
                  mockAccount.currentRemainingCredits,
                [TABLE_FIELDS.accounts.lastUseDate]: mockAccount.lastUseDate,
                [TABLE_FIELDS.accounts.lastUser]: mockAccount.lastUser,
                [TABLE_FIELDS.accounts.lastDailyId]: mockAccount.lastDailyId
              }
            }
          ],
          has_more: false
        }
      });
    }

    if (url.includes("/tables/tbl_daily/records")) {
      if (method === "POST") {
        dailyCreates.push({
          fields: JSON.parse(String(init?.body)).fields
        });
        return Response.json({
          code: 0,
          data: { record: { record_id: "rec_daily_created", fields: {} } }
        });
      }

      return Response.json({
        code: 0,
        data: {
          items: mockDailyRecords.map((record) => ({
            record_id: record.recordId,
            fields: toDailyFields(record.fields)
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
  });

  return { accountUpdates, dailyCreates, counts };
}

function accountFieldNames(missing: string[] = []) {
  return [
    TABLE_FIELDS.accounts.group,
    TABLE_FIELDS.accounts.platform,
    TABLE_FIELDS.accounts.accountName,
    TABLE_FIELDS.accounts.accountType,
    TABLE_FIELDS.accounts.accountStatus,
    TABLE_FIELDS.accounts.animatorName,
    TABLE_FIELDS.accounts.userId,
    TABLE_FIELDS.accounts.startCredits,
    TABLE_FIELDS.accounts.currentRemainingCredits,
    TABLE_FIELDS.accounts.lastUseDate,
    TABLE_FIELDS.accounts.lastUser,
    TABLE_FIELDS.accounts.lastDailyId
  ].filter((fieldName) => !missing.includes(fieldName));
}
