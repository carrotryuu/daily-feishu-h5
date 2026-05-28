import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getEnv();
  const redirectUri = encodeURIComponent(`${env.appUrl}/api/auth/callback`);
  const state = encodeURIComponent("daily-h5");
  const url =
    "https://accounts.feishu.cn/open-apis/authen/v1/authorize" +
    `?client_id=${encodeURIComponent(env.feishuAppId)}` +
    `&redirect_uri=${redirectUri}` +
    `&state=${state}`;

  return NextResponse.redirect(url);
}
