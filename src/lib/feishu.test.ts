import assert from "node:assert/strict";
import test from "node:test";
import { FeishuOAuthError } from "./feishu";

test("keeps Feishu open_id on OAuth errors for diagnostics", () => {
  const error = new FeishuOAuthError({
    message: "missing user_id",
    feishuOpenId: "ou_test_open_id",
    redirectUri: "https://example.com/api/auth/callback",
    codeExists: true
  });

  assert.equal(error.feishuOpenId, "ou_test_open_id");
});
