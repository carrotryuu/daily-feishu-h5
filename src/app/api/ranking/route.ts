import { getCurrentUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { withApiPerf } from "@/lib/perf";
import { getRankingPageData } from "@/lib/ranking-service";
import { monthOf, today } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withApiPerf("/api/ranking", async () => {
    try {
      const user = await getCurrentUser();
      const url = new URL(request.url);
      const month = url.searchParams.get("month") || monthOf(today());
      return jsonOk(await getRankingPageData(user, month));
    } catch (error) {
      return jsonError(error);
    }
  });
}
