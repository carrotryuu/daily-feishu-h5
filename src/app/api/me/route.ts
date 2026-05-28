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
      currentLoginUserId: user.sessionOpenId,
      userIdSource: user.sessionSource,
      matchedPeopleField: TABLE_FIELDS.people.userId,
      devOpenIdConfigured: Boolean(getEnv().devOpenId)
    });
  } catch (error) {
    return jsonError(error);
  }
}
