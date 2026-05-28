import { getEnv } from "./env";

type FeishuResponse<T> = {
  code: number;
  msg?: string;
  data: T;
};

export type FeishuOAuthTokenResponse = {
  code?: number;
  msg?: string;
  error?: string;
  error_description?: string;
  user_access_token?: string;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  data?: {
    user_access_token?: string;
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
  };
};

export function extractUserAccessToken(tokenResponse?: FeishuOAuthTokenResponse) {
  return (
    tokenResponse?.data?.user_access_token ||
    tokenResponse?.user_access_token ||
    tokenResponse?.data?.access_token ||
    tokenResponse?.access_token
  );
}

export class FeishuOAuthError extends Error {
  feishuCode?: number;
  feishuMsg?: string;
  redirectUri: string;
  codeExists: boolean;
  response?: FeishuOAuthTokenResponse;

  constructor(input: {
    message: string;
    feishuCode?: number;
    feishuMsg?: string;
    redirectUri: string;
    codeExists: boolean;
    response?: FeishuOAuthTokenResponse;
  }) {
    super(input.message);
    this.name = "FeishuOAuthError";
    this.feishuCode = input.feishuCode;
    this.feishuMsg = input.feishuMsg;
    this.redirectUri = input.redirectUri;
    this.codeExists = input.codeExists;
    this.response = input.response;
  }
}

export type WikiNode = {
  node_token: string;
  obj_token: string;
  obj_type: string;
  title?: string;
};

let tenantTokenCache:
  | {
      token: string;
      expiresAt: number;
    }
  | undefined;

async function feishuFetch<T>(
  path: string,
  init: RequestInit & { tenantToken?: boolean } = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");

  if (init.tenantToken !== false) {
    headers.set("Authorization", `Bearer ${await getTenantAccessToken()}`);
  }

  const response = await fetch(`https://open.feishu.cn${path}`, {
    ...init,
    headers
  });
  const payload = (await response.json()) as FeishuResponse<T>;

  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.msg || `飞书接口请求失败：${path}`);
  }

  return payload.data;
}

export async function getTenantAccessToken() {
  const now = Date.now();
  if (tenantTokenCache && tenantTokenCache.expiresAt > now + 60_000) {
    return tenantTokenCache.token;
  }

  const env = getEnv();
  const response = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        app_id: env.feishuAppId,
        app_secret: env.feishuAppSecret
      })
    }
  );
  const payload = (await response.json()) as {
    code: number;
    msg?: string;
    tenant_access_token: string;
    expire: number;
  };

  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.msg || "获取飞书 tenant_access_token 失败");
  }

  tenantTokenCache = {
    token: payload.tenant_access_token,
    expiresAt: now + payload.expire * 1000
  };
  return tenantTokenCache.token;
}

export async function exchangeOAuthCode(code: string) {
  const env = getEnv();
  const redirectUri = `${env.appUrl}/api/auth/callback`;
  const response = await fetch("https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: env.feishuAppId,
      client_secret: env.feishuAppSecret,
      code,
      redirect_uri: redirectUri
    })
  });
  const payload = (await response.json()) as FeishuOAuthTokenResponse;

  console.log("[Feishu OAuth token response]", JSON.stringify(payload, null, 2));

  const userAccessToken = extractUserAccessToken(payload);

  if (!response.ok || payload.code !== 0 || !userAccessToken) {
    const feishuMsg =
      payload.msg ||
      payload.error_description ||
      payload.error ||
      (!userAccessToken ? "missing user_access_token" : undefined);

    throw new FeishuOAuthError({
      message: `飞书 OAuth 换 token 失败：code=${payload.code ?? "unknown"}，msg=${
        feishuMsg || "unknown"
      }，redirect_uri=${redirectUri}，code_exists=${Boolean(code)}`,
      feishuCode: payload.code,
      feishuMsg,
      redirectUri,
      codeExists: Boolean(code),
      response: payload
    });
  }

  return payload;
}

export async function getFeishuUserInfo(userAccessToken: string) {
  return feishuFetch<{
    name?: string;
    en_name?: string;
    avatar_url?: string;
    open_id: string;
    union_id?: string;
    email?: string;
  }>("/open-apis/authen/v1/user_info", {
    tenantToken: false,
    headers: {
      Authorization: `Bearer ${userAccessToken}`
    }
  });
}

export async function getWikiNodeInfo(wikiNodeToken: string) {
  const query = new URLSearchParams({ token: wikiNodeToken });
  const data = await feishuFetch<{ node: WikiNode }>(
    `/open-apis/wiki/v2/spaces/get_node?${query.toString()}`
  );
  return data.node;
}

export async function sendBotMessage(input: {
  openId: string;
  text: string;
}) {
  return feishuFetch<{ message_id: string }>(
    "/open-apis/im/v1/messages?receive_id_type=open_id",
    {
      method: "POST",
      body: JSON.stringify({
        receive_id: input.openId,
        msg_type: "text",
        content: JSON.stringify({ text: input.text })
      })
    }
  );
}
