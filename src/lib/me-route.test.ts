import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ACCOUNT_ADMIN_PERMISSIONS, ROLES, YES_NO } from "./constants";
import { buildMePayload } from "./me-payload";
import type { CurrentUser } from "./types";

test("/api/me payload includes accountAdminPermission on person", () => {
  const payload = buildMePayload(currentUser(), { devOpenIdConfigured: false });

  assert.equal(
    payload.person.accountAdminPermission,
    ACCOUNT_ADMIN_PERMISSIONS.group
  );
  assert.equal(
    payload.user.accountAdminPermission,
    ACCOUNT_ADMIN_PERMISSIONS.group
  );
});

test("home and top navigation use account permission for account entry", () => {
  const homeSource = readFileSync(
    join(process.cwd(), "src", "app", "page.tsx"),
    "utf8"
  );
  const layoutSource = readFileSync(
    join(process.cwd(), "src", "app", "layout.tsx"),
    "utf8"
  );

  assert.match(homeSource, /canAccessAccountPage\(await getCurrentUser\(\)\)/);
  assert.match(layoutSource, /canAccessAccountPage\(await getCurrentUser\(\)\)/);
});

function currentUser(): CurrentUser {
  return {
    sessionUserId: "animator_1",
    sessionOpenId: "open_id",
    sessionSource: "feishu_session",
    person: {
      userId: "animator_1",
      name: "动画师",
      role: ROLES.animator,
      group: "金鑫组",
      accountAdminPermission: ACCOUNT_ADMIN_PERMISSIONS.group,
      enabled: YES_NO.yes
    }
  };
}
