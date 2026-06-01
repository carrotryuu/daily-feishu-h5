import { getCurrentUser } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { withApiPerf } from "@/lib/perf";
import {
  getReviewPageData,
  submitReview,
  type ReviewSubmitInput
} from "@/lib/review-service";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiPerf("/api/review", async () => {
    try {
      const user = await getCurrentUser();
      return jsonOk(await getReviewPageData(user));
    } catch (error) {
      return jsonError(error);
    }
  });
}

export async function POST(request: Request) {
  return withApiPerf("/api/review", async () => {
    try {
      const user = await getCurrentUser();
      const input = await readJson<ReviewSubmitInput>(request);
      return jsonOk(await submitReview(user, input), { status: 201 });
    } catch (error) {
      return jsonError(error);
    }
  });
}
