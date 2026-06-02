export const ROLES = {
  animator: "动画师",
  typist: "打字生",
  director: "导演",
  manager: "管理岗/制片"
} as const;

export const ACCOUNT_TYPES = {
  personal: "个人绑定账号",
  shared: "共用测试账号"
} as const;

export const ACCOUNT_STATUS = {
  enabled: "启用",
  disabled: "停用"
} as const;

export const PLATFORM_OPTIONS = [
  "LIBTV",
  "RUNNING HUB",
  "FTITLE",
  "UPDREAM",
  "其他"
] as const;

export const DAILY_STATUS = {
  pending: "待审核",
  approved: "通过",
  rejected: "驳回",
  reviewed: "已审核",
  abnormal: "异常"
} as const;

export const DAILY_TYPES = {
  production: "生产日报",
  preparation: "筹备日报",
  retrospective: "复盘日报",
  other: "其他"
} as const;

export const YES_NO = {
  yes: "是",
  no: "否"
} as const;

export const PUSH_TYPES = {
  daily: "日报填写提醒",
  review: "日报审核提醒"
} as const;

export const K_WEIGHTS: Record<ReviewGrade, number> = {
  K1: 1.2,
  K2: 1,
  K3: 0.8,
  K4: 0.5,
  K5: 0.2
};

export type Role = (typeof ROLES)[keyof typeof ROLES];
export type AccountType = (typeof ACCOUNT_TYPES)[keyof typeof ACCOUNT_TYPES];
export type AccountStatus = (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];
export type Platform = (typeof PLATFORM_OPTIONS)[number];
export type DailyStatus = (typeof DAILY_STATUS)[keyof typeof DAILY_STATUS];
export type DailyType = (typeof DAILY_TYPES)[keyof typeof DAILY_TYPES];
export type YesNo = (typeof YES_NO)[keyof typeof YES_NO];
export type ReviewGrade = "K1" | "K2" | "K3" | "K4" | "K5";

export function normalizeRole(role: string): Role {
  const value = role.trim();
  const key = value.toLowerCase();

  if (value === ROLES.animator || key === "animator") return ROLES.animator;
  if (value === ROLES.typist || key === "typist") return ROLES.typist;
  if (value === ROLES.director || key === "director") return ROLES.director;
  if (
    value === ROLES.manager ||
    key === "manager" ||
    key === "admin" ||
    key === "administrator"
  ) {
    return ROLES.manager;
  }

  return value as Role;
}

export function isEnabledValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return [
    "是",
    "启用",
    "已启用",
    "可用",
    "在职",
    "true",
    "1",
    "yes",
    "enabled"
  ].includes(normalized);
}

export function normalizeEnabled(value: string): YesNo {
  return isEnabledValue(value) ? YES_NO.yes : YES_NO.no;
}

export function isPlatformOption(platform: string): platform is Platform {
  return (PLATFORM_OPTIONS as readonly string[]).includes(platform);
}

export const TABLE_FIELDS = {
  people: {
    userId: "用户ID",
    name: "姓名",
    role: "角色",
    group: "所属小组",
    enabled: "是否启用",
    remark: "备注"
  },
  accounts: {
    accountId: "账号ID",
    group: "所属小组",
    platform: "平台",
    accountName: "账号名称",
    accountType: "账号类型",
    accountStatus: "账号状态",
    animatorName: "绑定动画师",
    userId: "用户ID",
    startCredits: "账号起始积分",
    currentRemainingCredits: "当前剩余积分",
    lastUseDate: "最后使用日期",
    lastUser: "最后使用人",
    lastDailyId: "最后日报ID",
    remark: "备注"
  },
  daily: {
    dailyId: "日报ID",
    dailyType: null,
    accountRecordId: "账号记录ID",
    date: "日期",
    userId: "用户ID",
    name: "人员",
    group: "所属小组",
    changedAccount: "是否换号",
    account: "账号",
    platform: "平台",
    accountType: "账号类型",
    previousCredits: "昨日剩余积分",
    newAccountStartCredits: "新账号起始积分",
    remainingCredits: "今日剩余积分",
    consumedCredits: "今日积分消耗",
    assetCount: "本日资产生成数量",
    roughCutSeconds: "本日视频粗剪时长（s）",
    hasIssue: "是否存在生成问题",
    issueNote: "生成问题说明",
    nonProductionNote: "其他周期内容",
    status: "日报状态",
    includeRanking: "是否计入排行",
    month: "月份",
    submittedAt: "提交时间"
  },
  reviews: {
    reviewId: "审核ID",
    dailyId: "关联日报ID",
    date: "日期",
    name: "姓名",
    userId: "用户ID",
    group: "所属小组",
    reviewerUserId: "审核人用户ID",
    reviewerName: "审核人姓名",
    grade: "审核等级",
    weight: "K 权重",
    roughCutSeconds: "粗剪时长",
    weightedRoughCutSeconds: "加权粗剪时长",
    note: "审核备注",
    status: "审核状态",
    reviewedAt: "审核时间",
    month: "月份"
  },
  rankings: {
    month: "月份",
    rank: "排名",
    animatorName: "动画师姓名",
    group: "所属小组",
    roughCutSeconds: "月粗剪总时长",
    weightedRoughCutSeconds: "月加权粗剪总时长",
    averageWeight: "月平均K 权重",
    updatedAt: "更新时间"
  },
  pushLogs: {
    pushId: "推送ID",
    date: "推送日期",
    userId: "用户ID",
    name: "人员",
    role: "角色",
    group: "所属小组",
    type: "推送类型",
    pushedAt: "推送时间",
    status: "推送状态",
    failedReason: "失败原因"
  }
} as const;
