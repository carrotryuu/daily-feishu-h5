import { jsonError, jsonOk } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { runDailyPush } from "@/lib/push-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertCron(request);
    return jsonOk(await runDailyPush());
  } catch (error) {
    return jsonError(error);
  }
}

function assertCron(request: Request) {
  const url = new URL(request.url);
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  const secret = url.searchParams.get("secret") || token;
  if (secret !== getEnv().cronSecret) {
    throw new Response("定时任务密钥不正确", { status: 401 });
  }
}
