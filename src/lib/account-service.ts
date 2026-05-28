import {
  ACCOUNT_STATUS,
  ACCOUNT_TYPES,
  ROLES,
  YES_NO,
  isPlatformOption
} from "./constants";
import { createRecord, updateRecord } from "./bitable";
import {
  getAccounts,
  getPeople,
  toAccountFields,
  type RawFields
} from "./records";
import { canSeeGroup } from "./auth";
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
  if (user.person.role === ROLES.manager) return true;
  return person.group === user.person.group;
}

export async function getAccountPageData(user: CurrentUser) {
  if (user.person.role !== ROLES.director && user.person.role !== ROLES.manager) {
    throw new Response("只有导演和管理岗/制片可以维护账号", { status: 403 });
  }

  const [accounts, people] = await Promise.all([getAccounts(), getPeople()]);
  return {
    user: user.person,
    accounts: accounts
      .filter((record) => canSeeGroup(user.person, record.fields.group))
      .map((record) => ({ ...record.fields, recordId: record.recordId })),
    people: people
      .filter((record) => canBindAnimator(user, record.fields))
      .map((record) => record.fields)
  };
}

export async function saveAccount(user: CurrentUser, input: AccountInput) {
  if (user.person.role !== ROLES.director && user.person.role !== ROLES.manager) {
    throw new Response("当前角色无权维护账号", { status: 403 });
  }
  if (!canSeeGroup(user.person, input.group)) {
    throw new Response("不能维护其他小组账号", { status: 403 });
  }

  const platform = input.platform.trim();
  if (!isPlatformOption(platform)) {
    throw new Response("平台只能选择 LIBTV、RUNNING HUB、FTITLE、UPDREAM、其他", {
      status: 400
    });
  }

  const people = await getPeople();
  const animator = input.userId
    ? people.find((record) => record.fields.userId === input.userId)?.fields
    : undefined;

  if (input.userId && !animator) {
    throw new Response("绑定动画师不存在", { status: 400 });
  }

  if (input.accountType === ACCOUNT_TYPES.personal && !animator) {
    throw new Response("个人绑定账号必须选择绑定动画师", { status: 400 });
  }

  if (animator && !canBindAnimator(user, animator)) {
    throw new Response("只能绑定可选范围内的启用动画师", { status: 403 });
  }

  const fields = toAccountFields({
    ...input,
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
