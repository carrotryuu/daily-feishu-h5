import { jsonError, jsonOk } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { monthOf, today } from "@/lib/dates";
import { recomputeRanking } from "@/lib/ranking-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertCron(request);
    const url = new URL(request.url);
    const month = url.searchParams.get("month") || monthOf(today());
    return jsonOk(await recomputeRanking(month));
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
