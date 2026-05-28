import {
  DAILY_STATUS,
  DAILY_TYPES,
  ROLES,
  TABLE_FIELDS,
  YES_NO,
  type ReviewGrade
} from "./constants";
import { createRecord, updateRecord } from "./bitable";
import { canSeeGroup } from "./auth";
import { calculateConsumedCredits, reviewRankingDecision } from "./domain";
import { formatDate, monthOf, nowIso } from "./dates";
import {
  getDailyRecords,
  toReviewFields,
  type RawFields
} from "./records";
import { recomputeRanking } from "./ranking-service";
import type { CurrentUser, DailyRecord, ReviewRecord } from "./types";

export type ReviewSubmitInput = {
  recordId: string;
  grade: ReviewGrade;
  note?: string;
  markAbnormal?: boolean;
  includeRanking?: boolean;
};

export async function getReviewPageData(user: CurrentUser) {
  if (user.person.role !== ROLES.director && user.person.role !== ROLES.manager) {
    throw new Response("只有导演和管理岗/制片可以审核日报", { status: 403 });
  }

  const daily = await getDailyRecords();
  return {
    user: user.person,
    pending: daily
      .filter((record) => record.fields.status === DAILY_STATUS.pending)
      .filter((record) => canSeeGroup(user.person, record.fields.group))
      .map((record) => ({
        ...record.fields,
        recordId: record.recordId,
        dailyId: record.fields.dailyId || record.recordId,
        consumedCredits: resolvedConsumedCredits(record.fields)
      }))
  };
}

export async function submitReview(user: CurrentUser, input: ReviewSubmitInput) {
  if (user.person.role !== ROLES.director && user.person.role !== ROLES.manager) {
    throw new Response("当前角色无权审核日报", { status: 403 });
  }
  if (!input.grade) {
    throw new Response("审核必须选择 K 等级", { status: 400 });
  }

  const dailyRecords = await getDailyRecords();
  const daily = dailyRecords.find((record) => record.recordId === input.recordId);
  if (!daily) {
    throw new Response("日报不存在", { status: 404 });
  }
  if (!canSeeGroup(user.person, daily.fields.group)) {
    throw new Response("不能审核其他小组日报", { status: 403 });
  }
  if (daily.fields.status !== DAILY_STATUS.pending) {
    throw new Response("只有待审核日报可以提交审核", { status: 400 });
  }

  const reviewedAt = nowIso();
  const consumedCredits = resolvedConsumedCredits(daily.fields);
  const decision = reviewRankingDecision({
    consumedCredits,
    accountType: daily.fields.accountType,
    dailyType: daily.fields.dailyType,
    date: daily.fields.date,
    reviewedAtDate: formatDate(new Date(reviewedAt)),
    reviewerMarkedAbnormal: Boolean(input.markAbnormal),
    reviewerIncludedRanking: input.includeRanking !== false
  });

  const dailyId = daily.fields.dailyId || daily.recordId;
  const review: ReviewRecord = {
    dailyId,
    date: daily.fields.date,
    name: daily.fields.name,
    userId: daily.fields.userId,
    group: daily.fields.group,
    reviewerUserId: user.person.userId,
    reviewerName: user.person.name,
    grade: input.grade,
    roughCutSeconds: daily.fields.roughCutSeconds,
    note: input.note || "",
    status: "已审核",
    reviewedAt,
    month: daily.fields.month
  };

  const f = TABLE_FIELDS.daily;
  await updateRecord<RawFields>("daily", daily.recordId, {
    [f.status]: decision.status,
    [f.includeRanking]: decision.includeRanking ? YES_NO.yes : YES_NO.no
  });
  await createRecord("reviews", toReviewFields(review));
  await recomputeRanking(daily.fields.month);

  return {
    ok: true,
    status: decision.status,
    includeRanking: decision.includeRanking
  };
}

function resolvedConsumedCredits(record: DailyRecord) {
  if (record.dailyType !== DAILY_TYPES.production) return 0;

  return (
    record.consumedCredits ??
    calculateConsumedCredits({
      changedAccount: record.changedAccount === YES_NO.yes,
      previousCredits: record.previousCredits,
      newAccountStartCredits: record.newAccountStartCredits,
      remainingCredits: record.remainingCredits
    })
  );
}
