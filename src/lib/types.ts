import type {
  AccountStatus,
  AccountAdminPermission,
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
  accountAdminPermission?: AccountAdminPermission;
  enabled: YesNo;
  remark?: string;
};

export type Account = {
  accountId?: string;
  group: string;
  platform: Platform;
  accountName: string;
  accountType: AccountType | "";
  accountStatus: AccountStatus;
  animatorName?: string;
  userId?: string;
  startCredits: number;
  currentRemainingCredits?: number;
  lastUseDate?: string;
  lastUser?: string;
  lastDailyId?: string;
  remark?: string;
};

export type DailyRecord = {
  dailyId?: string;
  dailyType: DailyType;
  accountRecordId?: string;
  date: string;
  userId: string;
  name: string;
  group: string;
  changedAccount: YesNo;
  account: string;
  platform: string;
  accountType: AccountType | "";
  projectName?: string;
  projectType?: string;
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
  reviewReply?: string;
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
  type: "日报填写提醒" | "日报审核提醒" | "审核结果通知";
  receiveIdType?: "user_id";
  receiveId?: string;
  pushedAt: string;
  status: "成功" | "失败" | "跳过";
  failedReason?: string;
};

export type CurrentUser = {
  sessionUserId: string;
  sessionOpenId?: string;
  sessionSource: "feishu_session" | "dev_open_id";
  person: Person;
};
