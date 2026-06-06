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

test("/daily page accepts and stores project group from /api/projects", () => {
  assert.match(pageSource, /group: string/);
  assert.match(pageSource, /projectGroup: project\?\.group \|\| ""/);
});

test("/daily project select uses shared project option label", () => {
  assert.match(pageSource, /projectOptionLabel\(project\)/);
});

test("/daily page has project type filter defaulting to all", () => {
  assert.match(pageSource, /useState<ProjectTypeFilter>\("all"\)/);
  assert.match(pageSource, /<label>项目类型<\/label>/);
  assert.match(pageSource, /<option value="all">全部<\/option>/);
  assert.match(pageSource, /<option value="demo">Demo<\/option>/);
  assert.match(pageSource, /<option value="正式项目">正式项目<\/option>/);
});

test("/daily project select renders type-filtered projects", () => {
  assert.match(pageSource, /const visibleProjects = useMemo/);
  assert.match(pageSource, /projectMatchesTypeFilter\(project, projectTypeFilter\)/);
  assert.match(pageSource, /visibleProjects\.map/);
});

test("/daily clears selected project when project type filter no longer matches", () => {
  assert.match(pageSource, /function updateProjectTypeFilter/);
  assert.match(pageSource, /projectMatchesTypeFilter\(currentProject, filter\)/);
  assert.match(pageSource, /selectedProjectName: ""/);
  assert.match(pageSource, /projectType: ""/);
  assert.match(pageSource, /projectGroup: ""/);
});

test("/daily empty projects message is scoped to current group", () => {
  assert.match(
    pageSource,
    /暂无你所在小组的可选项目，可先不选择项目。/
  );
});
