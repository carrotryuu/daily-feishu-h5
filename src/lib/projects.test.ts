import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { GET as getProjectsRoute } from "../app/api/projects/route";
import { getSelectableProjects } from "./projects";
import { resetBitableCachesForTest } from "./bitable";

test("GET /api/projects returns projects array", async (t) => {
  installProjectsFetchMock(t);

  const response = await getProjectsRoute();
  const payload = (await response.json()) as {
    projects?: Array<Record<string, string>>;
  };

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(payload.projects));
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
  assert.equal(JSON.stringify(projects).includes("opt_"), false);
});

function installProjectsFetchMock(t: TestContext) {
  resetBitableCachesForTest();
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];

  process.env.FEISHU_APP_ID = "app_id";
  process.env.FEISHU_APP_SECRET = "app_secret";
  process.env.FEISHU_BASE_APP_TOKEN = "daily_app_token";
  process.env.APP_URL = "http://localhost:3000";
  process.env.CRON_SECRET = "cron_secret";
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

    if (url.includes("/tables/project_table_id/records")) {
      return Response.json({
        code: 0,
        data: {
          items: [
            record("rec_empty_name", "", "opt_demo", "opt_video", "opt_normal"),
            record(
              "rec_video",
              "视频项目",
              "opt_formal",
              "opt_video",
              "opt_normal"
            ),
            record(
              "rec_feedback",
              "反馈项目",
              "demo",
              "opt_feedback",
              "opt_delay"
            ),
            record("rec_asset", "资产项目", "", "资产生成", ""),
            record("rec_prepare", "筹备项目", "", "筹备", ""),
            record("rec_review", "复盘项目", "opt_demo", "opt_review", "正常"),
            record("rec_stopped", "停止项目", "opt_demo", "视频制作", "opt_stopped"),
            record("rec_delay", "延期项目", "opt_demo", "opt_video", "延期")
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
  });

  return { urls };
}

function record(
  recordId: string,
  name: string,
  type: string,
  stage: string,
  status: string
) {
  return {
    record_id: recordId,
    fields: {
      项目名称: name,
      项目类型: type,
      当前阶段: stage,
      项目情况: status
    }
  };
}
