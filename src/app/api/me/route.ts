import { getCurrentUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { TABLE_FIELDS } from "@/lib/constants";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return jsonOk({
      user: user.person,
      userId: user.sessionUserId,
      feishuOpenId: user.sessionOpenId ?? null,
      feishuUserId: user.sessionUserId,
      matchedUserId: user.sessionUserId,
      currentLoginUserId: user.sessionUserId,
      userIdSource: user.sessionSource,
      matchedPeopleField: TABLE_FIELDS.people.userId,
      devOpenIdConfigured: Boolean(getEnv().devOpenId)
    });
  } catch (error) {
    return jsonError(error);
  }
}
