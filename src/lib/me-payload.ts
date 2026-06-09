import { TABLE_FIELDS } from "./constants";
import type { CurrentUser } from "./types";

export function buildMePayload(
  user: CurrentUser,
  options: { devOpenIdConfigured: boolean }
) {
  return {
    person: user.person,
    user: user.person,
    userId: user.sessionUserId,
    feishuOpenId: user.sessionOpenId ?? null,
    feishuUserId: user.sessionUserId,
    matchedUserId: user.sessionUserId,
    currentLoginUserId: user.sessionUserId,
    userIdSource: user.sessionSource,
    matchedPeopleField: TABLE_FIELDS.people.userId,
    devOpenIdConfigured: options.devOpenIdConfigured
  };
}
