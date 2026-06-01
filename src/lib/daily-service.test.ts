import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_STATUS,
  ACCOUNT_TYPES,
  DAILY_STATUS,
  DAILY_TYPES,
  PLATFORM_OPTIONS,
  ROLES,
  YES_NO
} from "./constants";
import { buildProductionDailyRecord, findPreviousCredits } from "./daily-service";
import { calculateConsumedCredits, defaultDailyDecision } from "./domain";
import { toDailyFields } from "./records";
import type { Account, BitableRecord, DailyRecord } from "./types";
import type { CurrentUser } from "./types";

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
