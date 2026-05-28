import {
  ACCOUNT_TYPES,
  DAILY_STATUS,
  DAILY_TYPES,
  K_WEIGHTS,
  type AccountType,
  type DailyType,
  type ReviewGrade
} from "./constants";
import { isWithinTPlusOne } from "./dates";

export type RankingInput = {
  userId: string;
  name: string;
  group: string;
  roughCutSeconds: number;
  consumedCredits: number;
  grade: ReviewGrade;
};

export type RankingRow = {
  userId: string;
  name: string;
  group: string;
  rank: number;
  roughCutSeconds: number;
  weightedRoughCutSeconds: number;
  averageWeight: number;
  consumedCredits: number;
  score: number;
};

export function calculateConsumedCredits(input: {
  changedAccount: boolean;
  previousCredits: number;
  newAccountStartCredits: number;
  remainingCredits: number;
}) {
  if (input.changedAccount) {
    return (
      input.previousCredits +
      input.newAccountStartCredits -
      input.remainingCredits
    );
  }
  return input.previousCredits - input.remainingCredits;
}

export function defaultDailyDecision(input: {
  consumedCredits: number;
  accountType: AccountType | "";
  dailyType?: DailyType;
  date: string;
  reviewedAtDate?: string;
}) {
  if ((input.dailyType ?? DAILY_TYPES.production) !== DAILY_TYPES.production) {
    return {
      status: DAILY_STATUS.pending,
      includeRanking: false
    };
  }

  if (input.consumedCredits < 0) {
    return {
      status: DAILY_STATUS.abnormal,
      includeRanking: false
    };
  }

  const canRank =
    input.accountType === ACCOUNT_TYPES.personal &&
    isWithinTPlusOne(input.date) &&
    (!input.reviewedAtDate || isWithinTPlusOne(input.date, input.reviewedAtDate));

  return {
    status: DAILY_STATUS.pending,
    includeRanking: canRank
  };
}

export function reviewRankingDecision(input: {
  consumedCredits: number;
  accountType: AccountType | "";
  dailyType?: DailyType;
  date: string;
  reviewedAtDate: string;
  reviewerMarkedAbnormal: boolean;
  reviewerIncludedRanking: boolean;
}) {
  if (input.reviewerMarkedAbnormal || input.consumedCredits < 0) {
    return { status: DAILY_STATUS.abnormal, includeRanking: false };
  }

  const includeRanking =
    input.reviewerIncludedRanking &&
    (input.dailyType ?? DAILY_TYPES.production) === DAILY_TYPES.production &&
    input.accountType === ACCOUNT_TYPES.personal &&
    isWithinTPlusOne(input.date) &&
    isWithinTPlusOne(input.date, input.reviewedAtDate);

  return {
    status: DAILY_STATUS.reviewed,
    includeRanking
  };
}

export function buildRankingRows(rows: RankingInput[]): RankingRow[] {
  const grouped = new Map<string, RankingRow & { weightCount: number }>();

  for (const row of rows) {
    const weight = K_WEIGHTS[row.grade];
    const current =
      grouped.get(row.userId) ??
      {
        userId: row.userId,
        name: row.name,
        group: row.group,
        rank: 0,
        roughCutSeconds: 0,
        weightedRoughCutSeconds: 0,
        averageWeight: 0,
        consumedCredits: 0,
        score: 0,
        weightCount: 0
      };

    current.roughCutSeconds += row.roughCutSeconds;
    current.weightedRoughCutSeconds += row.roughCutSeconds * weight;
    current.consumedCredits += row.consumedCredits;
    current.averageWeight += weight;
    current.weightCount += 1;
    grouped.set(row.userId, current);
  }

  const ranked = Array.from(grouped.values()).map((row) => {
    const score =
      row.consumedCredits > 0
        ? row.weightedRoughCutSeconds / row.consumedCredits
        : 0;
    return {
      ...row,
      averageWeight: row.weightCount > 0 ? row.averageWeight / row.weightCount : 0,
      score
    };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.weightedRoughCutSeconds !== a.weightedRoughCutSeconds) {
      return b.weightedRoughCutSeconds - a.weightedRoughCutSeconds;
    }
    return a.consumedCredits - b.consumedCredits;
  });

  return ranked.map(({ weightCount: _weightCount, ...row }, index) => ({
    ...row,
    rank: index + 1
  }));
}
