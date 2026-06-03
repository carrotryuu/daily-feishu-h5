import {
  ACCOUNT_TYPES,
  DAILY_STATUS,
  DAILY_TYPES,
  PUSH_TYPES,
  ROLES,
  TABLE_FIELDS,
  YES_NO,
  normalizeRole,
  type ReviewGrade
} from "./constants";
import { createRecord, updateRecord } from "./bitable";
import { calculateConsumedCredits } from "./domain";
import { getEnv, getLoginUrl } from "./env";
import { FeishuApiError, sendBotMessage } from "./feishu";
import { formatDate, nowIso } from "./dates";
import {
  getPeople,
  getDailyRecords,
  normalizeFieldText,
  normalizeGroupName,
  toPushLogFields,
  toReviewFields,
  type RawFields
} from "./records";
import { recomputeRanking } from "./ranking-service";
import type {
  BitableRecord,
  CurrentUser,
  DailyRecord,
  Person,
  ReviewRecord
} from "./types";

export type ReviewSubmitInput = {
  recordId: string;
  grade: ReviewGrade;
  note?: string;
  reviewComment?: string;
  markAbnormal?: boolean;
  includeRanking?: boolean;
  action?: "approve" | "reject" | "abnormal";
};

export type ReviewNotifyResult = {
  status: "success" | "failed" | "skipped";
  userId?: string;
  receiveIdType: "user_id";
  receiveId?: string;
  reason?: string;
  feishuCode?: number;
  feishuMsg?: string;
};

export type ReviewDependencies = {
  getDailyRecords: typeof getDailyRecords;
  getPeople?: typeof getPeople;
  updateRecord: typeof updateRecord;
  createRecord: typeof createRecord;
  recomputeRanking: typeof recomputeRanking;
  nowIso: typeof nowIso;
  sendBotMessage?: typeof sendBotMessage;
  appUrl?: string;
};

const defaultReviewDependencies: ReviewDependencies = {
  getDailyRecords,
  getPeople,
  updateRecord,
  createRecord,
  recomputeRanking,
  nowIso,
  sendBotMessage
};

export async function getReviewPageData(user: CurrentUser) {
  assertCanReview(user);

  const [daily, people] = await Promise.all([getDailyRecords(), getPeople()]);
  const reviewData = buildReviewListData(user, daily, people);

  console.info("[Review request]", {
    directorUserId: user.person.userId,
    directorName: user.person.name,
    directorRole: user.person.role,
    directorGroup: user.person.group
  });
  console.info("[Review daily records loaded]", reviewData.debug);

  return {
    user: user.person,
    pending: reviewData.pending,
    debug: reviewData.debug
  };
}

function assertCanReview(user: CurrentUser) {
  const role = normalizeRole(String(user.person.role));
  if (role !== ROLES.director && role !== ROLES.manager) {
    throw new Response("只有导演和管理岗/制片可以审核日报", { status: 403 });
  }

  if (role === ROLES.director && !normalizeGroupName(user.person.group)) {
    throw new Response("当前导演缺少所属小组，无法判断可审核日报", { status: 400 });
  }
}

export async function submitReview(user: CurrentUser, input: ReviewSubmitInput) {
  return submitReviewWithDependencies(user, input, defaultReviewDependencies);
}

export async function submitReviewWithDependencies(
  user: CurrentUser,
  input: ReviewSubmitInput,
  dependencies: ReviewDependencies
) {
  assertCanReview(user);
  if (!input.grade) {
    throw new Response("审核必须选择 K 等级", { status: 400 });
  }

  const dailyRecords = await dependencies.getDailyRecords();
  const daily = dailyRecords.find((record) => record.recordId === input.recordId);
  if (!daily) {
    throw new Response("日报不存在", { status: 404 });
  }
  const people = (await dependencies.getPeople?.()) ?? [];
  const groupResolution = resolveEffectiveDailyGroup(
    daily,
    new Map(
      people
        .filter((record) => record.fields.userId)
        .map((record) => [record.fields.userId, record.fields])
    ),
    new Map(
      people
        .filter((record) => record.fields.name)
        .map((record) => [record.fields.name, record.fields])
    )
  );
  if (!canReviewGroup(user, groupResolution.effectiveGroup)) {
    throw new Response("不能审核其他小组日报", { status: 403 });
  }
  if (normalizeFieldText(daily.fields.status) !== DAILY_STATUS.pending) {
    throw new Response("只有待审核日报可以提交审核", { status: 400 });
  }

  const reviewedAt = dependencies.nowIso();
  const reviewComment = input.reviewComment?.trim() || "";
  const consumedCredits = resolvedConsumedCredits(daily.fields);
  const decision = reviewDecision({
    action: input.action,
    markAbnormal: Boolean(input.markAbnormal),
    consumedCredits,
    accountType: daily.fields.accountType,
    dailyType: daily.fields.dailyType,
    date: daily.fields.date,
    reviewedAtDate: formatDate(new Date(reviewedAt)),
    includeRanking: input.includeRanking !== false
  });

  const dailyId = daily.fields.dailyId || daily.recordId;
  const review: ReviewRecord = {
    dailyId,
    date: daily.fields.date,
    name: daily.fields.name,
    userId: daily.fields.userId,
    group: groupResolution.effectiveGroup || daily.fields.group,
    reviewerUserId: user.person.userId,
    reviewerName: user.person.name,
    grade: input.grade,
    roughCutSeconds: daily.fields.roughCutSeconds,
    note: input.note || reviewComment,
    status: "已审核",
    reviewedAt,
    month: daily.fields.month
  };

  const f = TABLE_FIELDS.daily;
  await dependencies.updateRecord<RawFields>("daily", daily.recordId, {
    [f.status]: decision.status,
    [f.includeRanking]: decision.includeRanking ? YES_NO.yes : YES_NO.no,
    [f.reviewReply]: reviewComment
  });
  await dependencies.createRecord("reviews", toReviewFields(review));
  await dependencies.recomputeRanking(daily.fields.month);
  const reviewNotify = await notifyAnimatorAfterReview({
    daily,
    people,
    reviewerName: user.person.name,
    reviewStatus: decision.status,
    reviewComment,
    dependencies
  });

  return {
    ok: true,
    status: decision.status,
    includeRanking: decision.includeRanking,
    reviewNotify
  };
}

async function notifyAnimatorAfterReview(input: {
  daily: BitableRecord<DailyRecord>;
  people: BitableRecord<Person>[];
  reviewerName: string;
  reviewStatus: DailyRecord["status"];
  reviewComment: string;
  dependencies: ReviewDependencies;
}): Promise<ReviewNotifyResult> {
  const receiveIdType = "user_id" as const;
  const animatorUserId = resolveAnimatorUserId(input.daily.fields, input.people);
  const pushedAt = input.dependencies.nowIso();
  const baseLog = {
    date: input.daily.fields.date,
    userId: animatorUserId || "",
    name: input.daily.fields.name,
    role: ROLES.animator,
    group: input.daily.fields.group,
    type: PUSH_TYPES.reviewResult,
    receiveIdType,
    receiveId: animatorUserId || "",
    pushedAt
  };

  if (!animatorUserId) {
    const result: ReviewNotifyResult = {
      status: "skipped",
      receiveIdType,
      reason: "missing_animator_user_id"
    };
    await writeReviewNotifyLog(input.dependencies, {
      ...baseLog,
      status: "跳过",
      failedReason: result.reason
    });
    logReviewNotify(input, result, animatorUserId);
    return result;
  }

  try {
    await (input.dependencies.sendBotMessage || sendBotMessage)({
      userId: animatorUserId,
      text: buildReviewNotifyText({
        daily: input.daily.fields,
        reviewerName: input.reviewerName,
        reviewStatus: input.reviewStatus,
        reviewComment: input.reviewComment,
        appUrl: input.dependencies.appUrl || getEnv().appUrl
      })
    });
    const result: ReviewNotifyResult = {
      status: "success",
      userId: animatorUserId,
      receiveIdType,
      receiveId: animatorUserId
    };
    await writeReviewNotifyLog(input.dependencies, {
      ...baseLog,
      userId: animatorUserId,
      receiveId: animatorUserId,
      status: "成功"
    });
    logReviewNotify(input, result, animatorUserId);
    return result;
  } catch (error) {
    const result: ReviewNotifyResult = {
      status: "failed",
      userId: animatorUserId,
      receiveIdType,
      receiveId: animatorUserId,
      reason: error instanceof Error ? error.message : "unknown_error",
      feishuCode: error instanceof FeishuApiError ? error.feishuCode : undefined,
      feishuMsg: error instanceof FeishuApiError ? error.feishuMsg : undefined
    };
    await writeReviewNotifyLog(input.dependencies, {
      ...baseLog,
      userId: animatorUserId,
      receiveId: animatorUserId,
      status: "失败",
      failedReason: formatNotifyFailedReason(result)
    });
    logReviewNotify(input, result, animatorUserId);
    return result;
  }
}

function resolveAnimatorUserId(
  daily: DailyRecord,
  people: BitableRecord<Person>[]
) {
  if (daily.userId) return daily.userId;

  return people.find((record) => record.fields.name === daily.name)?.fields.userId || "";
}

function buildReviewNotifyText(input: {
  daily: DailyRecord;
  reviewerName: string;
  reviewStatus: DailyRecord["status"];
  reviewComment: string;
  appUrl: string;
}) {
  return [
    "你的日报已审核",
    "",
    `日期：${input.daily.date}`,
    `日报类型：${input.daily.dailyType || DAILY_TYPES.production}`,
    `审核结果：${input.reviewStatus}`,
    `审核人：${input.reviewerName}`,
    `审核回复：${input.reviewComment || "无"}`,
    "",
    "请进入日报系统查看详情：",
    getLoginUrl(input.appUrl)
  ].join("\n");
}

async function writeReviewNotifyLog(
  dependencies: ReviewDependencies,
  record: Parameters<typeof toPushLogFields>[0]
) {
  try {
    await dependencies.createRecord("pushLogs", toPushLogFields(record));
  } catch (error) {
    console.warn("[Review notify push log failed]", {
      reason: error instanceof Error ? error.message : "unknown_error"
    });
  }
}

function logReviewNotify(
  input: {
    daily: BitableRecord<DailyRecord>;
    reviewerName: string;
    reviewStatus: DailyRecord["status"];
    reviewComment: string;
  },
  result: ReviewNotifyResult,
  animatorUserId: string
) {
  console.info("[Review notify animator]", {
    dailyRecordId: input.daily.recordId,
    animatorUserId,
    animatorName: input.daily.fields.name,
    reviewerName: input.reviewerName,
    reviewStatus: input.reviewStatus,
    hasReviewComment: Boolean(input.reviewComment),
    receiveIdType: "user_id",
    status: result.status,
    reason: result.reason,
    feishuCode: result.feishuCode,
    feishuMsg: result.feishuMsg
  });
}

function formatNotifyFailedReason(result: ReviewNotifyResult) {
  return [result.reason, result.feishuCode, result.feishuMsg]
    .filter((value) => value !== undefined && value !== "")
    .join(" | ");
}

export function buildVisiblePendingDailyRecords(
  user: CurrentUser,
  daily: BitableRecord<DailyRecord>[],
  people: BitableRecord<Person>[] = []
) {
  return buildReviewListData(user, daily, people).pending;
}

export function buildReviewListData(
  user: CurrentUser,
  daily: BitableRecord<DailyRecord>[],
  people: BitableRecord<Person>[] = []
) {
  const peopleByUserId = new Map(
    people
      .filter((record) => record.fields.userId)
      .map((record) => [record.fields.userId, record.fields])
  );
  const peopleByName = new Map(
    people
      .filter((record) => record.fields.name)
      .map((record) => [record.fields.name, record.fields])
  );
  const hiddenRecords: Array<{
    recordId: string;
    date: string;
    userId: string;
    name: string;
    status: string;
    rawStatus: string;
    normalizedStatus: string;
    group: string;
    rawGroup: string;
    normalizedGroup: string;
    effectiveGroup: string;
    groupSource: string;
    directorGroup: string;
    rawDirectorGroup: string;
    normalizedDirectorGroup: string;
    account: string;
    otherPeriodContent: string;
    hiddenReason: string;
  }> = [];
  const groupFallbacks: Array<{
    recordId: string;
    name: string;
    userId: string;
    rawDailyGroup: string;
    fallbackGroup: string;
    groupSource: string;
  }> = [];
  const pending = [];

  for (const record of daily) {
    const groupResolution = resolveEffectiveDailyGroup(
      record,
      peopleByUserId,
      peopleByName
    );
    if (groupResolution.groupSource !== "daily_field") {
      groupFallbacks.push({
        recordId: record.recordId,
        name: record.fields.name,
        userId: record.fields.userId,
        rawDailyGroup: record.fields.group,
        fallbackGroup: groupResolution.effectiveGroup,
        groupSource: groupResolution.groupSource
      });
    }
    const hiddenReason = hiddenReviewReason(user, record, groupResolution);
    if (hiddenReason) {
      hiddenRecords.push({
        recordId: record.recordId,
        date: record.fields.date,
        userId: record.fields.userId,
        name: record.fields.name,
        status: record.fields.status,
        rawStatus: fieldDebugText(record.fields.status),
        normalizedStatus: normalizeFieldText(record.fields.status),
        group: record.fields.group,
        rawGroup: fieldDebugText(record.fields.group),
        normalizedGroup: normalizeGroupName(record.fields.group),
        effectiveGroup: groupResolution.effectiveGroup,
        groupSource: groupResolution.groupSource,
        directorGroup: user.person.group,
        rawDirectorGroup: fieldDebugText(user.person.group),
        normalizedDirectorGroup: normalizeGroupName(user.person.group),
        account: record.fields.account,
        otherPeriodContent: record.fields.nonProductionNote || "",
        hiddenReason
      });
      continue;
    }

    pending.push({
      ...record.fields,
      group: groupResolution.effectiveGroup || record.fields.group,
      recordId: record.recordId,
      dailyId: record.fields.dailyId || record.recordId,
      consumedCredits: resolvedConsumedCredits(record.fields)
    });
  }

  const hiddenReasonsSummary = hiddenRecords.reduce<Record<string, number>>(
    (summary, record) => {
      summary[record.hiddenReason] = (summary[record.hiddenReason] || 0) + 1;
      return summary;
    },
    {}
  );
  const hiddenRecordSamples = hiddenRecords.slice(0, 20);

  const debug = {
    directorUserId: user.person.userId,
    directorName: user.person.name,
    directorRole: user.person.role,
    directorGroup: user.person.group,
    totalDailyRecords: daily.length,
    pendingRecords: daily.filter(
      (record) => normalizeFieldText(record.fields.status) === DAILY_STATUS.pending
    ).length,
    visibleRecords: pending.length,
    hiddenReasonsSummary,
    hiddenRecords: hiddenRecordSamples,
    groupFallbacks,
    groupMismatchSamples: hiddenRecordSamples
      .filter((record) => record.hiddenReason === "group_mismatch")
      .slice(0, 5)
  };

  return { pending, debug };
}

function hiddenReviewReason(
  user: CurrentUser,
  record: BitableRecord<DailyRecord>,
  groupResolution: GroupResolution
) {
  const normalizedStatus = normalizeFieldText(record.fields.status);
  if (!normalizedStatus) return "invalid_status_field";
  if (normalizedStatus !== DAILY_STATUS.pending) return "status_not_pending";
  if (!normalizeGroupName(groupResolution.effectiveGroup)) return "missing_group";
  if (
    !normalizeGroupName(user.person.group) &&
    normalizeRole(String(user.person.role)) !== ROLES.manager
  ) {
    return "director_group_missing";
  }
  if (!canReviewGroup(user, groupResolution.effectiveGroup)) {
    return "group_mismatch";
  }
  return "";
}

type GroupSource =
  | "daily_field"
  | "people_by_user_id"
  | "people_by_name"
  | "unresolved";

type GroupResolution = {
  effectiveGroup: string;
  groupSource: GroupSource;
};

function resolveEffectiveDailyGroup(
  record: BitableRecord<DailyRecord>,
  peopleByUserId: Map<string, Person>,
  peopleByName: Map<string, Person>
): GroupResolution {
  const dailyGroup = normalizeFieldText(record.fields.group);
  if (dailyGroup && !isOptionId(dailyGroup)) {
    return { effectiveGroup: dailyGroup, groupSource: "daily_field" };
  }

  const personByUserId = peopleByUserId.get(record.fields.userId);
  if (personByUserId?.group) {
    logReviewGroupFallback(record, personByUserId.group, "people_by_user_id");
    return {
      effectiveGroup: personByUserId.group,
      groupSource: "people_by_user_id"
    };
  }

  const personByName = peopleByName.get(record.fields.name);
  if (personByName?.group) {
    logReviewGroupFallback(record, personByName.group, "people_by_name");
    return {
      effectiveGroup: personByName.group,
      groupSource: "people_by_name"
    };
  }

  return { effectiveGroup: dailyGroup, groupSource: "unresolved" };
}

function isOptionId(value: string) {
  return /^opt[a-z0-9]+$/i.test(value.trim());
}

function logReviewGroupFallback(
  record: BitableRecord<DailyRecord>,
  fallbackGroup: string,
  groupSource: GroupSource
) {
  console.info("[Review group fallback]", {
    recordId: record.recordId,
    name: record.fields.name,
    userId: record.fields.userId,
    rawDailyGroup: record.fields.group,
    fallbackGroup,
    groupSource
  });
}

function reviewDecision(input: {
  action?: ReviewSubmitInput["action"];
  markAbnormal: boolean;
  consumedCredits: number;
  accountType: DailyRecord["accountType"];
  dailyType: DailyRecord["dailyType"];
  date: string;
  reviewedAtDate: string;
  includeRanking: boolean;
}) {
  if (input.action === "reject") {
    return { status: DAILY_STATUS.rejected, includeRanking: false };
  }

  if (input.action === "abnormal" || input.markAbnormal) {
    return { status: DAILY_STATUS.abnormal, includeRanking: false };
  }

  const includeRanking =
    input.includeRanking &&
    input.consumedCredits >= 0 &&
    input.dailyType === DAILY_TYPES.production &&
    input.accountType === ACCOUNT_TYPES.personal &&
    isWithinTPlusOneForReview(input.date, input.reviewedAtDate);

  return {
    status: DAILY_STATUS.approved,
    includeRanking
  };
}

function canReviewGroup(user: CurrentUser, group: string) {
  const role = normalizeRole(String(user.person.role));
  const directorGroup = normalizeGroupName(user.person.group);
  const dailyGroup = normalizeGroupName(group);
  return role === ROLES.manager || directorGroup === "全部" || dailyGroup === directorGroup;
}

function fieldDebugText(value: unknown) {
  return JSON.stringify(value) ?? "";
}

function isWithinTPlusOneForReview(date: string, reviewedAtDate: string) {
  const base = new Date(`${date}T00:00:00+08:00`).getTime();
  const reviewed = new Date(`${reviewedAtDate}T00:00:00+08:00`).getTime();
  return reviewed - base <= 24 * 60 * 60 * 1000 && reviewed >= base;
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
