import { listRecordsFromBitable } from "./bitable";
import { getEnv } from "./env";
import { normalizeFieldText } from "./records";

export type Project = {
  name: string;
  type: string;
  stage: string;
  status: string;
};

type ProjectFields = {
  项目名称?: unknown;
  项目类型?: unknown;
  当前阶段?: unknown;
  项目情况?: unknown;
};

export function getProjectBitableTarget() {
  const env = getEnv();
  if (!env.projectBitableAppToken) {
    throw new Error("缺少环境变量 PROJECT_BITABLE_APP_TOKEN");
  }
  if (!env.projectTableId) {
    throw new Error("缺少环境变量 PROJECT_TABLE_ID");
  }

  return {
    appToken: env.projectBitableAppToken,
    tableId: env.projectTableId,
    tableLabel: "projects"
  };
}

export async function getSelectableProjects() {
  const records = await listRecordsFromBitable<ProjectFields>(
    getProjectBitableTarget()
  );
  let filteredReviewStage = 0;
  let filteredStopped = 0;
  let hasOptUnresolved = false;
  const projects: Project[] = [];

  for (const record of records) {
    const project = mapProjectFields(record.fields);
    if (!project.name) continue;

    if (project.stage === "复盘") {
      filteredReviewStage += 1;
      continue;
    }

    if (project.status === "停止") {
      filteredStopped += 1;
      continue;
    }

    if ([project.type, project.stage, project.status].some(isOptionId)) {
      hasOptUnresolved = true;
    }

    projects.push(project);
  }

  console.info("[Projects loaded]", {
    totalRecords: records.length,
    returnedProjects: projects.length,
    filteredReviewStage,
    filteredStopped,
    hasOptUnresolved
  });

  return projects;
}

export function mapProjectFields(fields: ProjectFields): Project {
  return {
    name: normalizeFieldText(fields["项目名称"]),
    type: normalizeFieldText(fields["项目类型"]),
    stage: normalizeFieldText(fields["当前阶段"]),
    status: normalizeFieldText(fields["项目情况"])
  };
}

function isOptionId(value: string) {
  return /^opt[a-z0-9]+$/i.test(value);
}
