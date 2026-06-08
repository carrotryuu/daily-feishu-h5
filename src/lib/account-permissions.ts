import {
  ACCOUNT_ADMIN_PERMISSIONS,
  ROLES,
  isEnabledValue
} from "./constants";
import { normalizeGroupName } from "./records";
import type { Account, CurrentUser, Person } from "./types";

export type AccountManageScope = "none" | "group" | "global";

function personOf(user: CurrentUser | Person) {
  return "person" in user ? user.person : user;
}

export function getAccountManageScope(user: CurrentUser | Person): AccountManageScope {
  const person = personOf(user);
  if (!isEnabledValue(person.enabled)) return "none";

  if (person.role === ROLES.manager) return "global";
  if (person.accountAdminPermission === ACCOUNT_ADMIN_PERMISSIONS.global) {
    return "global";
  }
  if (person.accountAdminPermission === ACCOUNT_ADMIN_PERMISSIONS.group) {
    return "group";
  }
  if (person.role === ROLES.director) return "group";

  return "none";
}

export function canAccessAccountPage(user: CurrentUser | Person) {
  return getAccountManageScope(user) !== "none";
}

export function isSameNormalizedGroup(left: unknown, right: unknown) {
  const normalizedLeft = normalizeGroupName(left);
  const normalizedRight = normalizeGroupName(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export function canManageAccount(user: CurrentUser | Person, account: Account) {
  const person = personOf(user);
  const scope = getAccountManageScope(person);
  if (scope === "global") return true;
  if (scope === "group") return isSameNormalizedGroup(person.group, account.group);
  return false;
}
