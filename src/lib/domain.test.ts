import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_TYPES, DAILY_STATUS, DAILY_TYPES } from "./constants";
import {
  buildRankingRows,
  calculateConsumedCredits,
  defaultDailyDecision,
  reviewRankingDecision
} from "./domain";

test("calculates consumed credits without account change", () => {
  assert.equal(
    calculateConsumedCredits({
      changedAccount: false,
      previousCredits: 7823,
      newAccountStartCredits: 0,
      remainingCredits: 3000
    }),
    4823
  );
});

test("calculates consumed credits with account change", () => {
  assert.equal(
    calculateConsumedCredits({
      changedAccount: true,
      previousCredits: 7823,
      newAccountStartCredits: 5000,
      remainingCredits: 3000
    }),
    2000
  );
});

test("calculates consumed credits when changed account is yes text", () => {
  assert.equal(
    calculateConsumedCredits({
      changedAccount: "是",
      previousCredits: 7823,
      newAccountStartCredits: 5000,
      remainingCredits: 3000
    }),
    2000
  );
});

test("calculates consumed credits when changed account is no text", () => {
  assert.equal(
    calculateConsumedCredits({
      changedAccount: "否",
      previousCredits: 7823,
      newAccountStartCredits: 5000,
      remainingCredits: 3000
    }),
    4823
  );
});

test("calculates production consumed credits from previous and remaining credits", () => {
  assert.equal(
    calculateConsumedCredits({
      changedAccount: false,
      previousCredits: 40000,
      newAccountStartCredits: 0,
      remainingCredits: 30000
    }),
    10000
  );
});

test("negative credits keep submitted daily pending and excluded from ranking", () => {
  assert.deepEqual(
    defaultDailyDecision({
      consumedCredits: -1,
      accountType: ACCOUNT_TYPES.personal,
      date: "2026-05-27"
    }),
    { status: DAILY_STATUS.pending, includeRanking: false }
  );
});

test("shared account is not included in ranking", () => {
  const decision = reviewRankingDecision({
    consumedCredits: 10,
    accountType: ACCOUNT_TYPES.shared,
    date: "2026-05-26",
    reviewedAtDate: "2026-05-27",
    reviewerMarkedAbnormal: false,
    reviewerIncludedRanking: true
  });

  assert.equal(decision.status, DAILY_STATUS.approved);
  assert.equal(decision.includeRanking, false);
});

test("non-production daily is not included in ranking", () => {
  const decision = reviewRankingDecision({
    consumedCredits: 0,
    accountType: ACCOUNT_TYPES.personal,
    dailyType: DAILY_TYPES.preparation,
    date: "2026-05-26",
    reviewedAtDate: "2026-05-27",
    reviewerMarkedAbnormal: false,
    reviewerIncludedRanking: true
  });

  assert.equal(decision.status, DAILY_STATUS.approved);
  assert.equal(decision.includeRanking, false);
});

test("ranking sorts by score, weighted duration, then lower credits", () => {
  const rows = buildRankingRows([
    {
      userId: "a",
      name: "A",
      group: "G1",
      roughCutSeconds: 100,
      consumedCredits: 50,
      grade: "K1"
    },
    {
      userId: "b",
      name: "B",
      group: "G1",
      roughCutSeconds: 120,
      consumedCredits: 60,
      grade: "K1"
    },
    {
      userId: "c",
      name: "C",
      group: "G2",
      roughCutSeconds: 90,
      consumedCredits: 30,
      grade: "K2"
    }
  ]);

  assert.equal(rows[0].userId, "c");
  assert.equal(rows[1].userId, "b");
  assert.equal(rows[2].userId, "a");
});
