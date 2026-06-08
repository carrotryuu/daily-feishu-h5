import {
  ACCOUNT_STATUS,
  ACCOUNT_TYPES,
  ROLES,
  YES_NO,
  isPlatformOption
} from "./constants";
import { createRecord, updateRecord } from "./bitable";
import {
  canAccessAccountPage,
  canManageAccount,
  getAccountManageScope,
  isSameNormalizedGroup,
  type AccountManageScope
} from "./account-permissions";
import {
  getAccounts,
  getPeople,
  toAccountFields,
  type RawFields
} from "./records";
import type { Account, CurrentUser, Person } from "./types";

export type AccountInput = {
  recordId?: string;
  group: string;
  platform: string;
  accountName: string;
  accountType: Account["accountType"];
  accountStatus: Account["accountStatus"];
  animatorName?: string;
  userId?: string;
  startCredits: number;
  remark?: string;
};

function canBindAnimator(user: CurrentUser, person: Person) {
  if (person.role !== ROLES.animator) return false;
  if (person.enabled !== YES_NO.yes) return false;
  if (getAccountManageScope(user) === "global") return true;
  return isSameNormalizedGroup(person.group, user.person.group);
}

function logAccountPermission(input: {
  user: CurrentUser;
  scope: AccountManageScope;
  action: string;
  targetAccountGroup?: string;
  allowed: boolean;
}) {
  console.info("[Account permission]", {
    currentUserName: input.user.person.name,
    currentUserRole: input.user.person.role,
    currentUserGroup: input.user.person.group,
    accountAdminPermission: input.user.person.accountAdminPermission,
    scope: input.scope,
    action: input.action,
    targetAccountGroup: input.targetAccountGroup || "",
    allowed: input.allowed
  });
}

function assertCanAccessAccountPage(user: CurrentUser, action: string) {
  const scope = getAccountManageScope(user);
  const allowed = canAccessAccountPage(user);
  logAccountPermission({ user, scope, action, allowed });
  if (!allowed) {
    throw new Response("你没有账号管理权限。", { status: 403 });
  }
  return scope;
}

function assertCanManageTarget(
  user: CurrentUser,
  scope: AccountManageScope,
  action: string,
  account: Account
) {
  const allowed = canManageAccount(user, account);
  logAccountPermission({
    user,
    scope,
    action,
    targetAccountGroup: account.group,
    allowed
  });
  if (!allowed) {
    throw new Response("只能管理本组账号", { status: 403 });
  }
}

export async function getAccountPageData(user: CurrentUser) {
  const scope = assertCanAccessAccountPage(user, "list");

  const [accounts, people] = await Promise.all([getAccounts(), getPeople()]);
  return {
    user: user.person,
    accountManageScope: scope,
    accounts: accounts
      .filter((record) => canManageAccount(user, record.fields))
      .map((record) => ({ ...record.fields, recordId: record.recordId })),
    people: people
      .filter((record) => canBindAnimator(user, record.fields))
      .map((record) => record.fields)
  };
}

export async function saveAccount(user: CurrentUser, input: AccountInput) {
  const action = input.recordId ? "update" : "create";
  const scope = assertCanAccessAccountPage(user, action);

  if (scope === "group" && !isSameNormalizedGroup(user.person.group, input.group)) {
    logAccountPermission({
      user,
      scope,
      action,
      targetAccountGroup: input.group,
      allowed: false
    });
    throw new Response("只能管理本组账号", { status: 403 });
  }

  const accountName = input.accountName.trim();
  if (!accountName) {
    throw new Response("请填写账号", { status: 400 });
  }
  const accountType = input.accountType.trim();
  if (
    accountType !== ACCOUNT_TYPES.shared &&
    accountType !== ACCOUNT_TYPES.personal
  ) {
    throw new Response(
      "账号类型只能选择共享账号或个人绑定账号。请确认账号表「类型」字段包含选项「共享账号」和「个人绑定账号」。",
      { status: 400 }
    );
  }

  const platform = input.platform.trim();
  if (!isPlatformOption(platform)) {
    throw new Response("平台只能选择 LIBTV、RUNNING HUB、FTITLE、UPDREAM、其他", {
      status: 400
    });
  }

  const [people, accounts] = await Promise.all([getPeople(), getAccounts()]);
  const existingAccount = input.recordId
    ? accounts.find((record) => record.recordId === input.recordId)
    : undefined;

  if (input.recordId && !existingAccount) {
    throw new Response("账号不存在", { status: 404 });
  }
  if (existingAccount) {
    assertCanManageTarget(user, scope, action, existingAccount.fields);
  }

  const animator = input.userId
    ? people.find((record) => record.fields.userId === input.userId)?.fields
    : undefined;

  if (input.userId && !animator) {
    throw new Response("绑定动画师不存在", { status: 400 });
  }

  if (accountType === ACCOUNT_TYPES.personal && !animator) {
    throw new Response("个人绑定账号必须选择绑定动画师", { status: 400 });
  }

  if (animator && !canBindAnimator(user, animator)) {
    throw new Response("只能绑定可选范围内的启用动画师", { status: 403 });
  }

  const fields = toAccountFields({
    ...input,
    group: scope === "group" ? user.person.group : input.group.trim(),
    accountName,
    accountType,
    platform,
    animatorName: animator?.name || "",
    userId: animator?.userId || "",
    accountStatus: input.accountStatus || ACCOUNT_STATUS.enabled
  });

  if (input.recordId) {
    await updateRecord<RawFields>("accounts", input.recordId, fields);
    return { ok: true, recordId: input.recordId };
  }

  const created = await createRecord("accounts", fields);
  return { ok: true, recordId: created.recordId };
}
