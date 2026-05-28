import { NextResponse } from "next/server";
import {
  exchangeOAuthCode,
  extractUserAccessToken,
  FeishuOAuthError,
  getFeishuUserInfo
} from "@/lib/feishu";
import { getEnv } from "@/lib/env";
import { setSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

function buildOAuthErrorResponse(input: {
  error: unknown;
  redirectUri: string;
  codeExists: boolean;
  status?: number;
}) {
  const feishuError =
    input.error instanceof FeishuOAuthError
      ? input.error
      : new FeishuOAuthError({
          message: input.error instanceof Error ? input.error.message : "飞书 OAuth 回调失败",
          redirectUri: input.redirectUri,
          codeExists: input.codeExists
        });

  console.error("[Feishu OAuth callback error]", {
    message: feishuError.message,
    feishuCode: feishuError.feishuCode,
    feishuMsg: feishuError.feishuMsg,
    redirectUri: feishuError.redirectUri,
    codeExists: feishuError.codeExists,
    response: feishuError.response
  });

  return NextResponse.json(
    {
      error: feishuError.message,
      feishu_error_code: feishuError.feishuCode ?? null,
      feishu_error_msg: feishuError.feishuMsg ?? null,
      redirect_uri: feishuError.redirectUri,
      code_exists: feishuError.codeExists,
      token_response: feishuError.response ?? null
    },
    { status: input.status || 500 }
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const env = getEnv();
  const redirectUri = `${env.appUrl}/api/auth/callback`;

  if (!code) {
    return buildOAuthErrorResponse({
      error: new FeishuOAuthError({
        message: "缺少飞书登录 code",
        feishuMsg: "missing code",
        redirectUri,
        codeExists: false
      }),
      redirectUri,
      codeExists: false,
      status: 400
    });
  }

  try {
    const token = await exchangeOAuthCode(code);
    console.log("[Feishu OAuth callback token]", JSON.stringify(token, null, 2));

    const userAccessToken = extractUserAccessToken(token);
    if (!token || !userAccessToken) {
      throw new FeishuOAuthError({
        message: "飞书 OAuth 换 token 失败：飞书响应为空或没有 user_access_token",
        feishuCode: token?.code,
        feishuMsg: token?.msg || token?.error_description || token?.error || "missing user_access_token",
        redirectUri,
        codeExists: true,
        response: token
      });
    }

    const user = await getFeishuUserInfo(userAccessToken);
    await setSession(user.open_id, user.name);

    return NextResponse.redirect(`${env.appUrl}/`);
  } catch (error) {
    return buildOAuthErrorResponse({
      error,
      redirectUri,
      codeExists: true
    });
  }
}
