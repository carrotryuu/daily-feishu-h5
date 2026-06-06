import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { getSelectableProjects } from "./projects";
import { resetBitableCachesForTest } from "./bitable";
import { ROLES, type Role } from "./constants";
import type { CurrentUser } from "./types";

const projectsRouteSource = readFileSync(
  join(process.cwd(), "src", "app", "api", "projects", "route.ts"),
  "utf8"
);

test("GET /api/projects service returns projects array with group", async (t) => {
  installProjectsFetchMock(t);

  const projects = await getSelectableProjects(currentUser(ROLES.animator, "孙导组"));

  assert.ok(Array.isArray(projects));
  assert.equal(typeof projects[0]?.group, "string");
});

test("GET /api/projects route filters with current user", () => {
  assert.match(projectsRouteSource, /getCurrentUser\(\)/);
  assert.match(projectsRouteSource, /getSelectableProjects\(user\)/);
});

test("/api/projects reads PROJECT_BITABLE_APP_TOKEN and PROJECT_TABLE_ID", async (t) => {
  const mock = installProjectsFetchMock(t);

  await getSelectableProjects();

  assert.ok(
    mock.urls.some((url) =>
      url.includes("/apps/project_app_token/tables/project_table_id/records")
    )
  );
  assert.equal(
    mock.urls.some((url) =>
      url.includes("/apps/daily_app_token/tables/tbl_daily/records")
    ),
    false
  );
});

test("selectable projects filter empty names, review stage, and stopped status", async (t) => {
  installProjectsFetchMock(t);

  const projects = await getSelectableProjects();

  assert.deepEqual(
    projects.map((project) => project.name),
    ["视频项目", "反馈项目", "资产项目", "筹备项目", "延期项目"]
  );
  assert.equal(projects.some((project) => project.name === ""), false);
  assert.equal(projects.some((project) => project.stage === "复盘"), false);
  assert.equal(projects.some((project) => project.status === "停止"), false);
});

test("/api/projects only returns same-group projects for animator", async (t) => {
  installProjectsFetchMock(t);

  const projects = await getSelectableProjects(currentUser(ROLES.animator, "孙导组"));

  assert.deepEqual(
    projects.map((project) => project.name),
    ["视频项目", "延期项目"]
  );
  assert.equal(projects.every((project) => project.group === "孙导组"), true);
});

test("/api/projects only returns same-group projects for director", async (t) => {
  installProjectsFetchMock(t);

  const projects = await getSelectableProjects(currentUser(ROLES.director, "马导组"));

  assert.deepEqual(
    projects.map((project) => project.name),
    ["反馈项目"]
  );
  assert.equal(projects.every((project) => project.group === "马导组"), true);
});

test("/api/projects returns all selectable projects for manager", async (t) => {
  installProjectsFetchMock(t);

  const projects = await getSelectableProjects(currentUser(ROLES.manager, "孙导组"));

  assert.deepEqual(
    projects.map((project) => project.name),
    ["视频项目", "反馈项目", "资产项目", "筹备项目", "延期项目"]
  );
});

test("empty project group is hidden from animator and visible to manager", async (t) => {
  installProjectsFetchMock(t);

  const animatorProjects = await getSelectableProjects(
    currentUser(ROLES.animator, "孙导组")
  );
  const managerProjects = await getSelectableProjects(
    currentUser(ROLES.manager, "孙导组")
  );

  assert.equal(animatorProjects.some((project) => !project.group), false);
  assert.equal(managerProjects.some((project) => !project.group), true);
});

test("project group comparison normalizes spaces", async (t) => {
  installProjectsFetchMock(t);

  const projects = await getSelectableProjects(
    currentUser(ROLES.animator, " 孙 导 组 ")
  );

  assert.deepEqual(
    projects.map((project) => project.name),
    ["视频项目", "延期项目"]
  );
});

test("selectable projects filter finished stage and status values", async (t) => {
  installProjectsFetchMock(t);

  const projects = await getSelectableProjects(currentUser(ROLES.manager, "全部"));
  const names = projects.map((project) => project.name);

  assert.equal(names.includes("阶段完成项目"), false);
  assert.equal(names.includes("情况完成项目"), false);
  assert.equal(names.includes("情况已完成项目"), false);
  assert.equal(names.includes("项目状态完成项目"), false);
  assert.equal(names.includes("状态已完成项目"), false);
});

test("/api/projects returns group from 所属小组 field", async (t) => {
  installProjectsFetchMock(t, { groupFieldName: "所属小组" });

  const projects = await getSelectableProjects();

  assert.equal(projects[0].group, "孙导组");
});

test("/api/projects returns group from 项目小组 field", async (t) => {
  installProjectsFetchMock(t, { groupFieldName: "项目小组" });

  const projects = await getSelectableProjects();

  assert.equal(projects[0].group, "孙导组");
});

test("/api/projects returns empty group when group field does not exist", async (t) => {
  installProjectsFetchMock(t, { includeGroupField: false });

  const projects = await getSelectableProjects();

  assert.equal(projects[0].group, "");
});

test("allowed project stages and statuses can be returned", async (t) => {
  installProjectsFetchMock(t);

  const projects = await getSelectableProjects();

  assert.deepEqual(
    projects.map((project) => project.stage),
    ["视频制作", "反馈修改", "资产生成", "筹备", "视频制作"]
  );
  assert.deepEqual(
    projects.map((project) => project.status),
    ["正常", "延期", "", "", "延期"]
  );
});

test("single select option ids are resolved to readable text", async (t) => {
  installProjectsFetchMock(t);

  const projects = await getSelectableProjects();

  assert.equal(projects[0].type, "正式项目");
  assert.equal(projects[0].stage, "视频制作");
  assert.equal(projects[0].status, "正常");
  assert.equal(projects[0].group, "孙导组");
  assert.equal(JSON.stringify(projects).includes("opt_"), false);
});

function installProjectsFetchMock(
  t: TestContext,
  options: { includeGroupField?: boolean; groupFieldName?: "所属小组" | "项目小组" } = {}
) {
  resetBitableCachesForTest();
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  const includeGroupField = options.includeGroupField !== false;
  const groupFieldName = options.groupFieldName ?? "所属小组";

  process.env.FEISHU_APP_ID = "app_id";
  process.env.FEISHU_APP_SECRET = "app_secret";
  process.env.FEISHU_BASE_APP_TOKEN = "daily_app_token";
  process.env.APP_URL = "http://localhost:3000";
  process.env.CRON_SECRET = "cron_secret";
  process.env.DEV_OPEN_ID = "animator_1";
  process.env.FEISHU_TABLE_PEOPLE = "tbl_people";
  process.env.FEISHU_TABLE_DAILY = "tbl_daily";
  process.env.PROJECT_BITABLE_APP_TOKEN = "project_app_token";
  process.env.PROJECT_TABLE_ID = "project_table_id";

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);

    if (url.includes("/tenant_access_token/internal")) {
      return Response.json({
        code: 0,
        tenant_access_token: "tenant_token",
        expire: 7200
      });
    }

    if (url.includes("/tables/project_table_id/fields")) {
      const groupField = includeGroupField
        ? [
            {
              field_id: "fld_group",
              field_name: groupFieldName,
              property: {
                options: [
                  { id: "opt_sun", name: "孙导组" },
                  { id: "opt_ma", name: "马导组" }
                ]
              }
            }
          ]
        : [];

      return Response.json({
        code: 0,
        data: {
          items: [
            { field_id: "fld_name", field_name: "项目名称" },
            {
              field_id: "fld_type",
              field_name: "项目类型",
              property: {
                options: [
                  { id: "opt_demo", name: "demo" },
                  { id: "opt_formal", name: "正式项目" }
                ]
              }
            },
            ...groupField,
            {
              field_id: "fld_stage",
              field_name: "当前阶段",
              property: {
                options: [
                  { id: "opt_prepare", name: "筹备" },
                  { id: "opt_asset", name: "资产生成" },
                  { id: "opt_video", name: "视频制作" },
                  { id: "opt_feedback", name: "反馈修改" },
                  { id: "opt_review", name: "复盘" }
                ]
              }
            },
            {
              field_id: "fld_status",
              field_name: "项目情况",
              property: {
                options: [
                  { id: "opt_normal", name: "正常" },
                  { id: "opt_delay", name: "延期" },
                  { id: "opt_stopped", name: "停止" }
                ]
              }
            }
          ],
          has_more: false
        }
      });
    }

    if (url.includes("/tables/tbl_people/fields")) {
      return Response.json({
        code: 0,
        data: {
          items: [
            { field_id: "fld_people_user_id", field_name: "用户ID" },
            { field_id: "fld_people_name", field_name: "姓名" },
            { field_id: "fld_people_role", field_name: "角色" },
            { field_id: "fld_people_group", field_name: "所属小组" },
            { field_id: "fld_people_enabled", field_name: "是否启用" }
          ],
          has_more: false
        }
      });
    }

    if (url.includes("/tables/tbl_people/records")) {
      return Response.json({
        code: 0,
        data: {
          items: [
            {
              record_id: "person_animator",
              fields: {
                用户ID: "animator_1",
                姓名: "动画师",
                角色: ROLES.animator,
                所属小组: "孙导组",
                是否启用: "是"
              }
            }
          ],
          has_more: false
        }
      });
    }

    if (url.includes("/tables/project_table_id/records")) {
      return Response.json({
        code: 0,
        data: {
          items: [
            record(
              "rec_empty_name",
              "",
              "opt_demo",
              "opt_video",
              "opt_normal",
              "",
              includeGroupField ? groupFieldName : undefined
            ),
            record(
              "rec_video",
              "视频项目",
              "opt_formal",
              "opt_video",
              "opt_normal",
              "opt_sun",
              includeGroupField ? groupFieldName : undefined
            ),
            record(
              "rec_feedback",
              "反馈项目",
              "demo",
              "opt_feedback",
              "opt_delay",
              "马导组",
              includeGroupField ? groupFieldName : undefined
            ),
            record(
              "rec_asset",
              "资产项目",
              "",
              "资产生成",
              "",
              "",
              includeGroupField ? groupFieldName : undefined
            ),
            record(
              "rec_prepare",
              "筹备项目",
              "",
              "筹备",
              "",
              "",
              includeGroupField ? groupFieldName : undefined
            ),
            record(
              "rec_review",
              "复盘项目",
              "opt_demo",
              "opt_review",
              "正常",
              "opt_sun",
              includeGroupField ? groupFieldName : undefined
            ),
            record(
              "rec_stopped",
              "停止项目",
              "opt_demo",
              "视频制作",
              "opt_stopped",
              "opt_sun",
              includeGroupField ? groupFieldName : undefined
            ),
            record(
              "rec_delay",
              "延期项目",
              "opt_demo",
              "opt_video",
              "延期",
              "opt_sun",
              includeGroupField ? groupFieldName : undefined
            ),
            record(
              "rec_stage_done",
              "阶段完成项目",
              "opt_demo",
              "完成",
              "正常",
              "opt_sun",
              includeGroupField ? groupFieldName : undefined
            ),
            record(
              "rec_status_done",
              "情况完成项目",
              "opt_demo",
              "opt_video",
              "完成",
              "opt_sun",
              includeGroupField ? groupFieldName : undefined
            ),
            record(
              "rec_status_done_text",
              "情况已完成项目",
              "opt_demo",
              "opt_video",
              "已完成",
              "opt_sun",
              includeGroupField ? groupFieldName : undefined
            ),
            record(
              "rec_project_state_done",
              "项目状态完成项目",
              "opt_demo",
              "opt_video",
              "正常",
              "opt_sun",
              includeGroupField ? groupFieldName : undefined,
              { 项目状态: "完成" }
            ),
            record(
              "rec_state_done",
              "状态已完成项目",
              "opt_demo",
              "opt_video",
              "正常",
              "opt_sun",
              includeGroupField ? groupFieldName : undefined,
              { 状态: "已完成" }
            )
          ],
          has_more: false
        }
      });
    }

    throw new Error(`Unexpected fetch ${url}`);
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetBitableCachesForTest();
    delete process.env.PROJECT_BITABLE_APP_TOKEN;
    delete process.env.PROJECT_TABLE_ID;
    delete process.env.DEV_OPEN_ID;
    delete process.env.FEISHU_TABLE_PEOPLE;
  });

  return { urls };
}

function record(
  recordId: string,
  name: string,
  type: string,
  stage: string,
  status: string,
  group = "",
  groupFieldName?: "所属小组" | "项目小组",
  extraFields: Record<string, unknown> = {}
) {
  return {
    record_id: recordId,
    fields: {
      项目名称: name,
      项目类型: type,
      当前阶段: stage,
      项目情况: status,
      ...(groupFieldName ? { [groupFieldName]: group } : {}),
      ...extraFields
    }
  };
}

function currentUser(role: Role, group: string): CurrentUser {
  return {
    sessionUserId: "user_1",
    sessionSource: "dev_open_id",
    person: {
      userId: "user_1",
      name: "测试用户",
      role,
      group,
      enabled: "是"
    }
  };
}
