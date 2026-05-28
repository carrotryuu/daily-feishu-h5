import { getCurrentUser } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import {
  getAccountPageData,
  saveAccount,
  type AccountInput
} from "@/lib/account-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return jsonOk(await getAccountPageData(user));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const input = await readJson<AccountInput>(request);
    return jsonOk(await saveAccount(user, input), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
