import { getCurrentUser, getSessionIdentity } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import {
  getDailyPageData,
  submitDaily,
  type DailySubmitInput
} from "@/lib/daily-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return jsonOk(await getDailyPageData(user));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
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
    if (error instanceof Response && error.status === 403) {
      const body = await error.text().catch(() => "");
      const payload = parseJsonBody(body);
      console.warn("[Daily submit forbidden]", {
        reason: payload?.reason || payload?.error || error.statusText,
        userId: user?.person.userId ?? null,
        role: user?.person.role ?? null,
        enabled: user?.person.enabled ?? null,
        group: user?.person.group ?? null,
        reportType: input?.reportType || input?.dailyType || null,
        accountRecordId: input?.accountRecordId || null
      });

      return new Response(
        body ||
          JSON.stringify({
            error: "FORBIDDEN",
            reason: "当前请求无权提交日报"
          }),
        {
          status: 403,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        }
      );
    }
    return jsonError(error);
  }
}

function parseJsonBody(body: string) {
  try {
    return JSON.parse(body) as { error?: string; reason?: string };
  } catch {
    return undefined;
  }
}
