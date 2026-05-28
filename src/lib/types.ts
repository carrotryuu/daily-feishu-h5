import type {
  AccountStatus,
  AccountType,
  DailyStatus,
  DailyType,
  Platform,
  ReviewGrade,
  Role,
  YesNo
} from "./constants";

export type BitableRecord<T> = {
  recordId: string;
  fields: T;
};

export type Person = {
  userId: string;
  name: string;
  role: Role;
  group: string;
  enabled: YesNo;
  remark?: string;
};

export type Account = {
  accountId?: string;
  group: string;
  platform: Platform;
  accountName: string;
  accountType: AccountType;
  accountStatus: AccountStatus;
  animatorName?: string;
  userId?: string;
  startCredits: number;
  remark?: string;
};

export type DailyRecord = {
  dailyId?: string;
  dailyType: DailyType;
  date: string;
  userId: string;
  name: string;
  group: string;
  changedAccount: YesNo;
  account: string;
  platform: string;
  accountType: AccountType | "";
  previousCredits: number;
  newAccountStartCredits: number;
  remainingCredits: number;
  consumedCredits?: number;
  assetCount: number;
  roughCutSeconds: number;
  hasIssue: YesNo;
  issueNote?: string;
  nonProductionNote?: string;
  status: DailyStatus;
  includeRanking: YesNo;
  month: string;
  submittedAt: string;
};

export type ReviewRecord = {
  reviewId?: string;
  dailyId: string;
  date: string;
  name: string;
  userId: string;
  group: string;
  reviewerUserId: string;
  reviewerName: string;
  grade: ReviewGrade;
  weight?: number;
  roughCutSeconds: number;
  weightedRoughCutSeconds?: number;
  note?: string;
  status: "已审核";
  reviewedAt: string;
  month: string;
};

export type RankingRecord = {
  month: string;
  rank: number;
  animatorName: string;
  group: string;
  roughCutSeconds: number;
  weightedRoughCutSeconds: number;
  averageWeight: number;
  updatedAt: string;
};

export type PushLogRecord = {
  date: string;
  userId: string;
  name: string;
  role: "动画师" | "导演";
  group: string;
  type: "日报填写提醒" | "日报审核提醒";
  pushedAt: string;
  status: "成功" | "失败";
  failedReason?: string;
};

export type CurrentUser = {
  sessionOpenId: string;
  sessionSource: "feishu_session" | "dev_open_id";
  person: Person;
};
