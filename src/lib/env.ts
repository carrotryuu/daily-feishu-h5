type Env = {
  feishuAppId: string;
  feishuAppSecret: string;
  feishuBaseAppToken: string;
  appUrl: string;
  cronSecret: string;
  devOpenId?: string;
  tables: {
    people?: string;
    accounts?: string;
    daily?: string;
    reviews?: string;
    rankings?: string;
    pushLogs?: string;
  };
};

function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`);
  }
  return value;
}

export function getEnv(): Env {
  return {
    feishuAppId: required("FEISHU_APP_ID"),
    feishuAppSecret: required("FEISHU_APP_SECRET"),
    feishuBaseAppToken: required("FEISHU_BASE_APP_TOKEN"),
    appUrl: required("APP_URL").replace(/\/$/, ""),
    cronSecret: required("CRON_SECRET"),
    devOpenId: process.env.DEV_OPEN_ID || undefined,
    tables: {
      people: process.env.FEISHU_TABLE_PEOPLE || undefined,
      accounts: process.env.FEISHU_TABLE_ACCOUNTS || undefined,
      daily: process.env.FEISHU_TABLE_DAILY || undefined,
      reviews: process.env.FEISHU_TABLE_REVIEWS || undefined,
      rankings: process.env.FEISHU_TABLE_RANKINGS || undefined,
      pushLogs: process.env.FEISHU_TABLE_PUSH_LOGS || undefined
    }
  };
}
