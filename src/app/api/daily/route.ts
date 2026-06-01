import { getCurrentUser, getSessionIdentity } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { withApiPerf } from "@/lib/perf";
import {
  getDailyPageData,
  submitDaily,
  type DailySubmitInput
} from "@/lib/daily-service";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiPerf("/api/daily", async () => {
    try {
      const user = await getCurrentUser();
      return jsonOk(await getDailyPageData(user));
    } catch (error) {
      return jsonError(error);
    }
  });
}

export async function POST(request: Request) {
  return withApiPerf("/api/daily", async () => {
    let input: DailySubmitInput | undefined;
    let user: Awaited<ReturnType<typeof getCurrentUser>> | undefined;

  try {
    const identity = await getSessionIdentity();
    input = await readJson<DailySubmitInput>(request);

    if (!identity.userId) {
      console.warn("[Daily submit forbidden]", {
        reason: "未读取到登录 session",
        userId: null,
        role: null,
        enabled: null,
        group: null,
        reportType: input.reportType || input.dailyType || null,
        accountRecordId: input.accountRecordId || null
      });
      return Response.json(
        {
          error: "UNAUTHENTICATED",
          reason: "未读取到登录 session"
        },
        { status: 401 }
      );
    }

    user = await getCurrentUser();
    console.info("[Daily submit request]", {
      userId: user.person.userId,
      role: user.person.role,
      enabled: user.person.enabled,
      group: user.person.group,
      reportType: input.reportType || input.dailyType || null,
      accountRecordId: input.accountRecordId || null,
      hasSession: true
    });

    const result = await submitDaily(user, input);
    console.info("[Daily submit success]", {
      userId: user.person.userId,
      reportType: input.reportType || input.dailyType || null,
      recordId: result.recordId
    });
    return jsonOk(result, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      const body = await error.text().catch(() => "");
      const parsed = parseJsonBody(body);
      console.error("[Daily submit response error]", {
        status: error.status,
        error: parsed?.error || error.statusText,
        reason: parsed?.reason || null,
        feishuError: parsed?.feishuError || null,
        debug: parsed?.debug || null,
        userId: user?.person.userId ?? null,
        role: user?.person.role ?? null,
        enabled: user?.person.enabled ?? null,
        group: user?.person.group ?? null,
        reportType: input?.reportType || input?.dailyType || null,
        accountRecordId: input?.accountRecordId || null
      });

      const responseBody =
        parsed && body
          ? body
          : JSON.stringify({
              error: parsed?.error || "REQUEST_FAILED",
              reason: parsed?.reason || body || error.statusText || "请求失败",
              feishuError: parsed?.feishuError || null,
              debug: parsed?.debug || null
            });

      return new Response(responseBody, {
        status: error.status,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }
      return jsonError(error);
    }
  });
}

function parseJsonBody(body: string) {
  try {
    return JSON.parse(body) as {
      error?: string;
      reason?: string;
      feishuError?: unknown;
      debug?: unknown;
    };
  } catch {
    return undefined;
  }
}
