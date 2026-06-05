import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(
  join(process.cwd(), "src", "app", "daily", "page.tsx"),
  "utf8"
);

test("/daily page loads projects from /api/projects", () => {
  assert.match(pageSource, /fetch\("\/api\/projects"/);
});

test("/daily project loading failure does not block daily form", () => {
  assert.match(pageSource, /项目列表加载失败，可先不选择项目。/);
  assert.match(pageSource, /选择项目（可选）/);
});
