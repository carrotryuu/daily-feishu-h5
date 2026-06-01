import {
  ACCOUNT_TYPES,
  DAILY_STATUS,
  DAILY_TYPES,
  ROLES,
  TABLE_FIELDS,
  YES_NO,
  type ReviewGrade
} from "./constants";
import { createRecord, updateRecord } from "./bitable";
import { canSeeGroup } from "./auth";
import { buildRankingRows } from "./domain";
import { formatDate, isWithinTPlusOne, monthOf, nowIso, today } from "./dates";
import {
  getDailyRecords,
  getRankingRecords,
  getReviewRecords,
  toRankingFields,
  type RawFields
} from "./records";
import type { CurrentUser, RankingRecord } from "./types";

export async function getRankingPageData(user: CurrentUser, month = monthOf(today())) {
  if (
    user.person.role !== ROLES.animator &&
    user.person.role !== ROLES.director &&
    user.person.role !== ROLES.manager
  ) {
    throw new Response("当前角色无权查看排行", { status: 403 });
  }

  const rankings = await getRankingRecords();
  const rows = rankings
    .filter((record) => record.fields.month === month)
    .filter((record) => canSeeGroup(user.person, record.fields.group))
    .map((record) => ({ ...record.fields, recordId: record.recordId }))
    .sort((a, b) => a.rank - b.rank);

  return {
    user: user.person,
    month,
    rows
  };
}

export async function recomputeRanking(month: string) {
  const [daily, reviews, existingRankings] = await Promise.all([
    getDailyRecords(),
    getReviewRecords(),
    getRankingRecords()
  ]);

  const reviewByDailyId = new Map(
    reviews
      .filter((record) => record.fields.month === month)
      .map((record) => [record.fields.dailyId, record.fields])
  );

  const inputs = daily
    .filter((record) => {
      const row = record.fields;
      if (row.month !== month) return false;
      if (row.dailyType !== DAILY_TYPES.production) return false;
      if (
        row.status !== DAILY_STATUS.approved &&
        row.status !== DAILY_STATUS.reviewed
      ) {
        return false;
      }
      if (row.includeRanking !== YES_NO.yes) return false;
      if (row.accountType !== ACCOUNT_TYPES.personal) return false;
      if ((row.consumedCredits ?? 0) < 0) return false;
      const review = reviewByDailyId.get(row.dailyId || record.recordId);
      if (!review) return false;
      const submittedDate = formatDate(new Date(row.submittedAt));
      const reviewedDate = formatDate(new Date(review.reviewedAt));
      return (
        isWithinTPlusOne(row.date, submittedDate) &&
        isWithinTPlusOne(row.date, reviewedDate)
      );
    })
    .map((record) => {
      const dailyId = record.fields.dailyId || record.recordId;
      const review = reviewByDailyId.get(dailyId);
      return {
        userId: record.fields.userId,
        name: record.fields.name,
        group: record.fields.group,
        roughCutSeconds: record.fields.roughCutSeconds,
        consumedCredits: record.fields.consumedCredits ?? 0,
        grade: (review?.grade || "K3") as ReviewGrade
      };
    });

  const rankingRows = buildRankingRows(inputs);

  for (const row of rankingRows) {
    const record: RankingRecord = {
      month,
      rank: row.rank,
      animatorName: row.name,
      group: row.group,
      roughCutSeconds: Math.round(row.roughCutSeconds),
      weightedRoughCutSeconds: Number(row.weightedRoughCutSeconds.toFixed(2)),
      averageWeight: Number(row.averageWeight.toFixed(2)),
      updatedAt: nowIso()
    };
    const existing = existingRankings.find(
      (item) =>
        item.fields.month === month &&
        item.fields.animatorName === row.name &&
        item.fields.group === row.group
    );

    if (existing) {
      await updateRecord<RawFields>(
        "rankings",
        existing.recordId,
        toRankingFields(record)
      );
    } else {
      await createRecord("rankings", toRankingFields(record));
    }
  }

  return {
    month,
    updated: rankingRows.length
  };
}

export function rankingDisplayFields() {
  return TABLE_FIELDS.rankings;
}
