import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_TYPES,
  DAILY_STATUS,
  DAILY_TYPES,
  ROLES,
  YES_NO
} from "./constants";
import { buildReviewListData } from "./review-service";
import type { BitableRecord, CurrentUser, DailyRecord } from "./types";

test("review diagnostics limits hiddenRecords samples", () => {
  const user: CurrentUser = {
    sessionUserId: "director_1",
    sessionSource: "dev_open_id",
    person: {
      userId: "director_1",
      name: "Director",
      role: ROLES.director,
      group: "A",
      enabled: YES_NO.yes
    }
  };
  const records = Array.from({ length: 25 }, (_, index) =>
    daily(`daily_${index}`, { group: "B" })
  );

  const data = buildReviewListData(user, records);

  assert.equal(data.pending.length, 0);
  assert.equal(data.debug.hiddenRecords.length, 20);
  assert.equal(data.debug.hiddenReasonsSummary.group_mismatch, 25);
});

function daily(
  recordId: string,
  overrides: Partial<DailyRecord> = {}
): BitableRecord<DailyRecord> {
  return {
    recordId,
    fields: {
      dailyType: DAILY_TYPES.production,
      date: "2026-05-27",
      userId: "animator_1",
      name: "Animator",
      group: "A",
      changedAccount: YES_NO.no,
      account: "Account",
      platform: "LIBTV",
      accountType: ACCOUNT_TYPES.personal,
      previousCredits: 100,
      newAccountStartCredits: 0,
      remainingCredits: 70,
      consumedCredits: 30,
      assetCount: 3,
      roughCutSeconds: 120,
      hasIssue: YES_NO.no,
      issueNote: "",
      nonProductionNote: "",
      status: DAILY_STATUS.pending,
      includeRanking: YES_NO.yes,
      month: "2026-05",
      submittedAt: "2026-05-27T10:00:00.000Z",
      ...overrides
    }
  };
}
