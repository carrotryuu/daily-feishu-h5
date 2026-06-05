import { getFieldNamesByBitableTarget, listRecordsFromBitable } from "./bitable";
import { getEnv } from "./env";
import { normalizeFieldText } from "./records";

export type Project = {
  name: string;
  type: string;
  stage: string;
  status: string;
  group: string;
};

type ProjectFields = {
  项目名称?: unknown;
  项目类型?: unknown;
  当前阶段?: unknown;
  项目情况?: unknown;
  所属小组?: unknown;
  项目小组?: unknown;
  小组?: unknown;
  负责小组?: unknown;
  导演组?: unknown;
};

const PROJECT_GROUP_FIELD_NAMES = [
  "所属小组",
  "项目小组",
  "小组",
  "负责小组",
  "导演组"
] as const;

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
  const target = getProjectBitableTarget();
  const fieldNames = await getFieldNamesByBitableTarget(target);
  const groupFieldName = PROJECT_GROUP_FIELD_NAMES.find((fieldName) =>
    fieldNames.has(fieldName)
  );
  const records = await listRecordsFromBitable<ProjectFields>(target);
  let filteredReviewStage = 0;
  let filteredStopped = 0;
  let hasOptUnresolved = false;
  const projects: Project[] = [];

  for (const record of records) {
    const project = mapProjectFields(record.fields, groupFieldName);
    if (!project.name) continue;

    if (project.stage === "复盘") {
      filteredReviewStage += 1;
      continue;
    }

    if (project.status === "停止") {
      filteredStopped += 1;
      continue;
    }

    if ([project.type, project.stage, project.status, project.group].some(isOptionId)) {
      hasOptUnresolved = true;
    }

    projects.push(project);
  }

  console.info("[Projects loaded]", {
    totalRecords: records.length,
    returnedProjects: projects.length,
    filteredReviewStage,
    filteredStopped,
    hasOptUnresolved,
    hasGroupField: Boolean(groupFieldName),
    groupFieldName: groupFieldName ?? "",
    emptyGroupCount: projects.filter((project) => !project.group).length
  });

  return projects;
}

export function mapProjectFields(
  fields: ProjectFields,
  selectedGroupFieldName?: (typeof PROJECT_GROUP_FIELD_NAMES)[number]
): Project {
  const groupFieldName =
    selectedGroupFieldName ??
    PROJECT_GROUP_FIELD_NAMES.find((fieldName) =>
      Object.prototype.hasOwnProperty.call(fields, fieldName)
    );

  return {
    name: normalizeFieldText(fields["项目名称"]),
    type: normalizeFieldText(fields["项目类型"]),
    stage: normalizeFieldText(fields["当前阶段"]),
    status: normalizeFieldText(fields["项目情况"]),
    group: groupFieldName ? normalizeFieldText(fields[groupFieldName]) : ""
  };
}

function isOptionId(value: string) {
  return /^opt[a-z0-9]+$/i.test(value);
}
