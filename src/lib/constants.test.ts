import assert from "node:assert/strict";
import test from "node:test";
import {
  ROLES,
  YES_NO,
  normalizeEnabled,
  normalizeRole
} from "./constants";

test("normalizes role values from people table", () => {
  assert.equal(normalizeRole("动画师"), ROLES.animator);
  assert.equal(normalizeRole("animator"), ROLES.animator);
  assert.equal(normalizeRole("ANIMATOR"), ROLES.animator);
  assert.equal(normalizeRole("打字生"), ROLES.typist);
});

test("normalizes enabled values from people table", () => {
  assert.equal(normalizeEnabled("是"), YES_NO.yes);
  assert.equal(normalizeEnabled("启用"), YES_NO.yes);
  assert.equal(normalizeEnabled("已启用"), YES_NO.yes);
  assert.equal(normalizeEnabled("在职"), YES_NO.yes);
  assert.equal(normalizeEnabled("true"), YES_NO.yes);
  assert.equal(normalizeEnabled("停用"), YES_NO.no);
});
