import { getCurrentUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { buildMePayload } from "@/lib/me-payload";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return jsonOk(
      buildMePayload(user, { devOpenIdConfigured: Boolean(getEnv().devOpenId) })
    );
  } catch (error) {
    return jsonError(error);
  }
}
