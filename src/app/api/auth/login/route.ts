import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getEnv();
  const rawRedirectUri = `${env.appUrl}/api/auth/callback`;
  const redirectUri = encodeURIComponent(rawRedirectUri);
  const state = encodeURIComponent("daily-h5");
  const scope = encodeURIComponent("auth:user.id:read");

  console.log("[Feishu OAuth login]", {
    app_id: env.feishuAppId,
    redirect_uri: rawRedirectUri,
    APP_URL: env.appUrl
  });

  const url =
    "https://accounts.feishu.cn/open-apis/authen/v1/authorize" +
    `?client_id=${encodeURIComponent(env.feishuAppId)}` +
    `&redirect_uri=${redirectUri}` +
    `&scope=${scope}` +
    `&state=${state}`;

  return NextResponse.redirect(url);
}
