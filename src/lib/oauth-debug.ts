export function maskSecret(value?: string) {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return `${value.slice(0, 1)}***${value.slice(-1)}`;
  }

  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

export function classifyFeishuBaseAppToken(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "unknown";
  }

  try {
    const url = new URL(trimmed);
    if (url.pathname.includes("/wiki/")) {
      return "wiki_url";
    }
    if (url.pathname.includes("/base/")) {
      return "base_url";
    }
  } catch {
    // Not a URL, so continue with raw token checks.
  }

  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return "raw_token";
  }

  return "unknown";
}

export function buildOAuthConfigDiagnostics() {
  const appUrl = process.env.APP_URL || "";
  const appUrlTrimmed = appUrl.replace(/\/$/, "");
  const appId = process.env.FEISHU_APP_ID || "";
  const appSecret = process.env.FEISHU_APP_SECRET || "";
  const baseAppToken = process.env.FEISHU_BASE_APP_TOKEN || "";

  return {
    APP_URL: {
      raw: appUrl,
      starts_with_http: /^https?:\/\//.test(appUrl),
      ends_with_slash: appUrl.endsWith("/")
    },
    FEISHU_APP_ID: {
      raw: appId,
      starts_with_cli: appId.startsWith("cli_"),
      length: appId.length,
      contains_env_name: appId.includes("FEISHU_APP_ID="),
      contains_space: /\s/.test(appId),
      trimmed: appId.trim()
    },
    FEISHU_APP_SECRET: {
      exists: Boolean(appSecret),
      length: appSecret.length,
      masked: maskSecret(appSecret),
      contains_env_name: appSecret.includes("FEISHU_APP_SECRET="),
      contains_space: /\s/.test(appSecret)
    },
    FEISHU_BASE_APP_TOKEN: {
      exists: Boolean(baseAppToken),
      type: classifyFeishuBaseAppToken(baseAppToken)
    },
    redirect_uri: `${appUrlTrimmed}/api/auth/callback`
  };
}

export function buildOAuthFailureDiagnostics(input: {
  redirectUri: string;
  tokenResponse?: unknown;
}) {
  const appId = process.env.FEISHU_APP_ID || "";
  const appSecret = process.env.FEISHU_APP_SECRET || "";

  return {
    redirect_uri: input.redirectUri,
    app_id: appId,
    app_id_starts_with_cli: appId.startsWith("cli_"),
    app_secret_exists: Boolean(appSecret),
    app_secret_length: appSecret.length,
    app_secret_masked: maskSecret(appSecret),
    token_response_raw: input.tokenResponse ?? null
  };
}
