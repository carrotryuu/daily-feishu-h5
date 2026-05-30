import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ROLES, TABLE_FIELDS, YES_NO, type Role } from "./constants";
import { getEnv } from "./env";
import { getPeople } from "./records";
import type { CurrentUser, Person } from "./types";

const COOKIE_NAME = "daily_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type Session = {
  userId?: string;
  openId?: string;
  name?: string;
  expiresAt: number;
};

type SessionIdentity = {
  userId?: string;
  openId?: string;
  source: "feishu_session" | "dev_open_id" | "none" | "legacy_open_id_session";
  devOpenIdConfigured: boolean;
  hasSessionCookie: boolean;
  sessionCookieValid: boolean;
};

type UserRecognitionDetails = {
  feishuOpenId: string | null;
  feishuUserId: string | null;
  matchedUserId: string | null;
  userIdSource: SessionIdentity["source"];
  matchedPeopleField: string;
  peopleTableQueried: boolean;
  peopleTableHasUserId: boolean | null;
  enabled: string | null;
  role: string | null;
  devOpenIdConfigured: boolean;
  hasSessionCookie: boolean;
  sessionCookieValid: boolean;
  peopleTableError?: string;
};

function sign(value: string) {
  return createHmac("sha256", getEnv().feishuAppSecret)
    .update(value)
    .digest("base64url");
}

function encodeSession(session: Session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(value?: string): Session | undefined {
  if (!value) return undefined;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return undefined;

  const expected = sign(payload);
  const ok =
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!ok) return undefined;

  const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as
    | Session
    | undefined;
  if (!session || session.expiresAt < Date.now()) return undefined;
  return session;
}

export async function setSession(
  ids: {
    userId: string;
    openId?: string;
  },
  name?: string
) {
  const cookieStore = await cookies();
  cookieStore.set(
    COOKIE_NAME,
    encodeSession({
      userId: ids.userId,
      openId: ids.openId,
      name,
      expiresAt: Date.now() + MAX_AGE_SECONDS * 1000
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: (process.env.APP_URL || "").startsWith("https://"),
      maxAge: MAX_AGE_SECONDS,
      path: "/"
    }
  );
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSessionIdentity(): Promise<SessionIdentity> {
  const env = getEnv();
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME)?.value;
  const session = decodeSession(sessionCookie);
  if (session?.userId) {
    return {
      userId: session.userId,
      openId: session.openId,
      source: "feishu_session",
      devOpenIdConfigured: Boolean(env.devOpenId),
      hasSessionCookie: Boolean(sessionCookie),
      sessionCookieValid: true
    };
  }

  if (session?.openId) {
    return {
      openId: session.openId,
      source: "legacy_open_id_session",
      devOpenIdConfigured: Boolean(env.devOpenId),
      hasSessionCookie: Boolean(sessionCookie),
      sessionCookieValid: true
    };
  }

  if (process.env.NODE_ENV !== "production" && env.devOpenId) {
    return {
      userId: env.devOpenId,
      source: "dev_open_id",
      devOpenIdConfigured: true,
      hasSessionCookie: Boolean(sessionCookie),
      sessionCookieValid: false
    };
  }

  return {
    source: "none",
    devOpenIdConfigured: Boolean(env.devOpenId),
    hasSessionCookie: Boolean(sessionCookie),
    sessionCookieValid: false
  };
}

export async function getSessionOpenId() {
  return (await getSessionIdentity()).userId;
}

export async function getSessionUserId() {
  return (await getSessionIdentity()).userId;
}

function userRecognitionResponse(
  status: number,
  message: string,
  details: UserRecognitionDetails
) {
  console.warn("[User recognition failed]", { message, ...details });

  return new Response(
    JSON.stringify({
      error: message,
      userRecognition: details
    }),
    {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    }
  );
}

function buildUserRecognitionMessage(details: UserRecognitionDetails) {
  return [
    "无法识别当前登录用户。",
    `feishu open_id：${details.feishuOpenId || "未获取到"}`,
    `feishu user_id：${details.feishuUserId || "未获取到"}`,
    `实际用于匹配人员表的 matchedUserId：${details.matchedUserId || "未获取到"}`,
    `人员表是否查询成功：${details.peopleTableQueried ? "是" : "否"}`,
    `人员表中是否存在该用户ID：${
      details.peopleTableHasUserId == null
        ? "无法判断"
        : details.peopleTableHasUserId
          ? "是"
          : "否"
    }`,
    `是否启用：${details.enabled || "未找到"}`,
    `角色字段值：${details.role || "未找到"}`,
    `匹配字段：人员表「${details.matchedPeopleField}」`,
    `DEV_OPEN_ID 是否配置：${details.devOpenIdConfigured ? "是" : "否"}`
  ].join("\n");
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const identity = await getSessionIdentity();
  const matchedUserId = identity.userId;
  const baseDetails = {
    feishuOpenId: identity.openId ?? null,
    feishuUserId: identity.userId ?? null,
    matchedUserId: matchedUserId ?? null,
    userIdSource: identity.source,
    matchedPeopleField: TABLE_FIELDS.people.userId,
    devOpenIdConfigured: identity.devOpenIdConfigured,
    hasSessionCookie: identity.hasSessionCookie,
    sessionCookieValid: identity.sessionCookieValid
  };

  if (!matchedUserId) {
    const details: UserRecognitionDetails = {
      ...baseDetails,
      peopleTableQueried: false,
      peopleTableHasUserId: null,
      enabled: null,
      role: null
    };
    throw userRecognitionResponse(401, buildUserRecognitionMessage(details), details);
  }

  let people: Awaited<ReturnType<typeof getPeople>>;
  try {
    people = await getPeople();
  } catch (error) {
    const details: UserRecognitionDetails = {
      ...baseDetails,
      peopleTableQueried: false,
      peopleTableHasUserId: null,
      enabled: null,
      role: null,
      peopleTableError: error instanceof Error ? error.message : String(error)
    };
    throw userRecognitionResponse(500, buildUserRecognitionMessage(details), details);
  }

  const person = people.find((record) => record.fields.userId === matchedUserId)?.fields;
  if (!person) {
    const details: UserRecognitionDetails = {
      ...baseDetails,
      peopleTableQueried: true,
      peopleTableHasUserId: false,
      enabled: null,
      role: null
    };
    throw userRecognitionResponse(403, buildUserRecognitionMessage(details), details);
  }

  const matchedDetails: UserRecognitionDetails = {
    ...baseDetails,
    peopleTableQueried: true,
    peopleTableHasUserId: true,
    enabled: person.enabled || null,
    role: person.role || null
  };

  if (person.enabled !== YES_NO.yes) {
    throw userRecognitionResponse(
      403,
      buildUserRecognitionMessage(matchedDetails),
      matchedDetails
    );
  }

  const sessionSource =
    identity.source === "dev_open_id" ? "dev_open_id" : "feishu_session";

  console.info("[User recognized]", {
    feishuOpenId: identity.openId ?? null,
    feishuUserId: identity.userId ?? null,
    matchedUserId,
    userIdSource: sessionSource,
    matchedPeopleField: TABLE_FIELDS.people.userId,
    enabled: person.enabled,
    role: person.role
  });

  return {
    sessionUserId: matchedUserId,
    sessionOpenId: identity.openId,
    sessionSource,
    person
  };
}

export function canUseRole(person: Person, allowed: Role[]) {
  return allowed.includes(person.role);
}

export function assertRole(person: Person, allowed: Role[]) {
  if (!canUseRole(person, allowed)) {
    throw new Response("当前角色无权访问此功能", { status: 403 });
  }
}

export function isManager(person: Person) {
  return person.role === ROLES.manager;
}

export function isDirector(person: Person) {
  return person.role === ROLES.director;
}

export function isAnimator(person: Person) {
  return person.role === ROLES.animator;
}

export function canSeeGroup(person: Person, group: string) {
  return isManager(person) || person.group === group;
}
