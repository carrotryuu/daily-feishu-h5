import { getCurrentUser } from "@/lib/auth";
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
  try {
    const user = await getCurrentUser();
    const input = await readJson<DailySubmitInput>(request);
    return jsonOk(await submitDaily(user, input), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
