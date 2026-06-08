import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(
  join(process.cwd(), "src", "app", "account", "page.tsx"),
  "utf8"
);

test("account page form uses 账号 label and accountName state", () => {
  assert.match(pageSource, /<label>账号<\/label>/);
  assert.match(pageSource, /value=\{form\.accountName\}/);
  assert.match(pageSource, /accountName: event\.target\.value/);
});

test("account page submits accountName in request body", () => {
  assert.match(pageSource, /body: JSON\.stringify\(\{/);
  assert.match(pageSource, /\.\.\.form/);
});

test("account page blocks empty accountName with clear message", () => {
  assert.match(pageSource, /!form\.accountName\.trim\(\)/);
  assert.match(pageSource, /setError\("请填写账号"\)/);
});

test("account table shows fallback when accountName is empty", () => {
  assert.match(pageSource, /account\.accountName \|\| "未填写账号"/);
});
