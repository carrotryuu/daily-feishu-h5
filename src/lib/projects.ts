import { getFieldNamesByBitableTarget, listRecordsFromBitable } from "./bitable";
import { ROLES, normalizeRole } from "./constants";
import { getEnv } from "./env";
import { normalizeFieldText, normalizeGroupName } from "./records";
import type { CurrentUser } from "./types";

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
  项目状态?: unknown;
  状态?: unknown;
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

export async function getSelectableProjects(currentUser?: CurrentUser) {
  const target = getProjectBitableTarget();
  const fieldNames = await getFieldNamesByBitableTarget(target);
  const groupFieldName = PROJECT_GROUP_FIELD_NAMES.find((fieldName) =>
    fieldNames.has(fieldName)
  );
  const records = await listRecordsFromBitable<ProjectFields>(target);
  const isManagerView = currentUser ? canViewAllProjects(currentUser) : true;
  const currentUserGroup = currentUser
    ? normalizeGroupName(currentUser.person.group)
    : "";
  const currentUserRole = currentUser
    ? normalizeRole(String(currentUser.person.role))
    : "";
  let filteredReviewStage = 0;
  let filteredEmptyName = 0;
  let filteredFinished = 0;
  let filteredStopped = 0;
  let filteredGroupMismatch = 0;
  let hasOptUnresolved = false;
  const projects: Project[] = [];

  for (const record of records) {
    const project = mapProjectFields(record.fields, groupFieldName);
    if (!project.name) {
      filteredEmptyName += 1;
      continue;
    }

    if (isFinishedProject(record.fields, project)) {
      if (project.stage === "复盘") filteredReviewStage += 1;
      filteredFinished += 1;
      continue;
    }

    if (isStoppedProject(project)) {
      filteredStopped += 1;
      continue;
    }

    if (!isManagerView && !canUserSeeProjectGroup(project.group, currentUserGroup)) {
      filteredGroupMismatch += 1;
      continue;
    }

    if ([project.type, project.stage, project.status, project.group].some(isOptionId)) {
      hasOptUnresolved = true;
    }

    projects.push(project);
  }

  console.info("[Projects loaded]", {
    currentUserName: currentUser?.person.name ?? "",
    currentUserRole,
    currentUserGroup: currentUser?.person.group ?? "",
    totalRecords: records.length,
    returnedProjects: projects.length,
    filteredEmptyName,
    filteredFinished,
    filteredReviewStage,
    filteredStopped,
    filteredGroupMismatch,
    hasOptUnresolved,
    hasGroupField: Boolean(groupFieldName),
    groupFieldName: groupFieldName ?? "",
    emptyGroupCount: projects.filter((project) => !project.group).length,
    isManagerView
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

function canViewAllProjects(user: CurrentUser) {
  const role = normalizeRole(String(user.person.role));
  const group = normalizeGroupName(user.person.group);
  return role === ROLES.manager || group === "全部";
}

function canUserSeeProjectGroup(projectGroup: string, currentUserGroup: string) {
  const normalizedProjectGroup = normalizeGroupName(projectGroup);
  return Boolean(normalizedProjectGroup && normalizedProjectGroup === currentUserGroup);
}

function isFinishedProject(fields: ProjectFields, project: Project) {
  const stage = normalizeFieldText(project.stage);
  if (stage === "复盘" || stage === "完成") return true;

  return [
    project.status,
    normalizeFieldText(fields["项目状态"]),
    normalizeFieldText(fields["状态"])
  ].some((value) => value === "完成" || value === "已完成");
}

function isStoppedProject(project: Project) {
  return normalizeFieldText(project.status) === "停止";
}
