import { getEnv } from "./env";
import { getTenantAccessToken, getWikiNodeInfo } from "./feishu";
import {
  recordFieldsMetaPerf,
  recordTablePerf,
  type CacheMissReason,
  type TableCachePerf
} from "./perf";
import type { BitableRecord } from "./types";

export const TABLE_NAMES = {
  people: "人员表",
  accounts: "平台账号表",
  daily: "日报表",
  reviews: "审核表",
  rankings: "月度排行表",
  pushLogs: "推送日志表"
} as const;

export type TableKey = keyof typeof TABLE_NAMES;

export type RawRecord = {
  record_id: string;
  fields: Record<string, unknown>;
};

type RawTable = {
  table_id: string;
  name: string;
};

type RawField = {
  field_id: string;
  field_name: string;
  property?: {
    options?: Array<{
      id?: string;
      name?: string;
      text?: string;
      value?: string;
    }>;
  };
  options?: Array<{
    id?: string;
    name?: string;
    text?: string;
    value?: string;
  }>;
};

type ListResponse = {
  items?: RawRecord[];
  page_token?: string;
  has_more?: boolean;
  total?: number;
};

type ListTablesResponse = {
  items?: RawTable[];
  page_token?: string;
  has_more?: boolean;
  total?: number;
};

type ListFieldsResponse = {
  items?: RawField[];
  page_token?: string;
  has_more?: boolean;
  total?: number;
};

export type TableFieldMeta = {
  fieldNames: Set<string>;
  optionNameByField: Record<string, Record<string, string>>;
};

export type ListRecordsOptions = {
  useCache?: boolean;
};

export type BitableTableTarget = {
  appToken: string;
  tableId: string;
  tableLabel?: string;
};

export class BitableError extends Error {
  status: number;
  code?: number;
  path: string;
  feishuMessage?: string;

  constructor(input: {
    status: number;
    code?: number;
    path: string;
    message: string;
    feishuMessage?: string;
  }) {
    super(input.message);
    this.name = "BitableError";
    this.status = input.status;
    this.code = input.code;
    this.path = input.path;
    this.feishuMessage = input.feishuMessage;
  }
}

let appTokenCache: string | undefined;
let tableIdCache: Partial<Record<TableKey, string>> | undefined;
const FIELD_META_TTL_MS = 10 * 60 * 1000;
const RECORD_CACHE_TTL_MS: Record<TableKey, number> = {
  people: 60 * 1000,
  accounts: 60 * 1000,
  daily: 15 * 1000,
  reviews: 15 * 1000,
  rankings: 60 * 1000,
  pushLogs: 60 * 1000
};

let fieldMetaCache = new Map<
  string,
  { createdAt: number; expiresAt: number; meta: TableFieldMeta; table: string }
>();
let recordCache = new Map<
  TableKey,
  {
    createdAt: number;
    expiresAt: number;
    records: BitableRecord<unknown>[];
    cacheKey: TableKey;
  }
>();
let recordCacheInvalidations = new Map<
  TableKey,
  {
    lastInvalidatedAt: number;
    invalidationReason: string;
  }
>();
let unresolvedOptionWarnings = new Set<string>();

async function bitableFetch<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await getTenantAccessToken()}`);
  headers.set("Content-Type", "application/json; charset=utf-8");

  const response = await fetch(`https://open.feishu.cn${path}`, {
    ...init,
    headers
  });
  const payload = (await response.json()) as {
    code: number;
    msg?: string;
    data: T;
  };

  if (!response.ok || payload.code !== 0) {
    throw new BitableError({
      status: response.status,
      code: payload.code,
      path,
      message: payload.msg || `飞书多维表格请求失败：${path}`,
      feishuMessage: payload.msg
    });
  }

  return payload.data;
}

function isTableKey(value: string): value is TableKey {
  return value in TABLE_NAMES;
}

function cleanToken(token: string) {
  return decodeURIComponent(token).trim();
}

export function extractFeishuBaseRef(value: string):
  | { type: "wiki"; token: string }
  | { type: "base"; token: string }
  | { type: "token"; token: string } {
  const input = value.trim();
  const wikiMatch = input.match(/(?:^|\/)wiki\/([^/?#]+)/i);
  if (wikiMatch?.[1]) {
    return { type: "wiki", token: cleanToken(wikiMatch[1]) };
  }

  const baseMatch = input.match(/(?:^|\/)base\/([^/?#]+)/i);
  if (baseMatch?.[1]) {
    return { type: "base", token: cleanToken(baseMatch[1]) };
  }

  if (/^wik/i.test(input)) {
    return { type: "wiki", token: input };
  }

  return { type: "token", token: input };
}

export async function getBitableAppToken() {
  if (appTokenCache) return appTokenCache;

  const ref = extractFeishuBaseRef(getEnv().feishuBaseAppToken);
  if (ref.type !== "wiki") {
    appTokenCache = ref.token;
    return appTokenCache;
  }

  const node = await getWikiNodeInfo(ref.token);
  if (node.obj_type !== "bitable") {
    throw new Error(
      `Wiki 节点不是多维表格，当前类型是 ${node.obj_type || "未知"}`
    );
  }

  appTokenCache = node.obj_token;
  process.env.FEISHU_BASE_APP_TOKEN = node.obj_token;
  return appTokenCache;
}

async function listTables() {
  const tables: RawTable[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (pageToken) query.set("page_token", pageToken);
    const data = await bitableFetch<ListTablesResponse>(
      `/open-apis/bitable/v1/apps/${await getBitableAppToken()}/tables?${query.toString()}`
    );

    tables.push(...(data.items ?? []));
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);

  return tables;
}

export async function getTableId(table: TableKey) {
  if (tableIdCache?.[table]) return tableIdCache[table];

  const configured = getEnv().tables[table];
  if (configured) {
    tableIdCache = { ...(tableIdCache ?? {}), [table]: configured };
    return configured;
  }

  const tables = await listTables();
  const resolved: Partial<Record<TableKey, string>> = {};
  for (const [key, name] of Object.entries(TABLE_NAMES) as [TableKey, string][]) {
    const matched = tables.find((item) => item.name.trim() === name);
    if (matched) {
      resolved[key] = matched.table_id;
      process.env[envTableName(key)] = matched.table_id;
    }
  }

  const missing = (Object.keys(TABLE_NAMES) as TableKey[]).filter(
    (key) => !resolved[key] && !getEnv().tables[key]
  );
  if (missing.length > 0) {
    throw new Error(
      `未找到这些数据表：${missing.map((key) => TABLE_NAMES[key]).join("、")}`
    );
  }

  tableIdCache = { ...(tableIdCache ?? {}), ...resolved };
  return tableIdCache[table]!;
}

function envTableName(table: TableKey) {
  const names: Record<TableKey, string> = {
    people: "FEISHU_TABLE_PEOPLE",
    accounts: "FEISHU_TABLE_ACCOUNTS",
    daily: "FEISHU_TABLE_DAILY",
    reviews: "FEISHU_TABLE_REVIEWS",
    rankings: "FEISHU_TABLE_RANKINGS",
    pushLogs: "FEISHU_TABLE_PUSH_LOGS"
  };
  return names[table];
}

async function getTableTarget(tableIdOrKey: string) {
  const table = isTableKey(tableIdOrKey) ? tableIdOrKey : undefined;
  const tableId = table ? await getTableId(table) : tableIdOrKey;
  const appToken = await getBitableAppToken();
  return { appToken, table, tableId };
}

function cacheKey(appToken: string, tableId: string) {
  return `${appToken}:${tableId}`;
}

function recordsCacheKey(table: TableKey) {
  return table;
}

async function tablePath(tableIdOrKey: string) {
  const tableId = isTableKey(tableIdOrKey)
    ? await getTableId(tableIdOrKey)
    : tableIdOrKey;
  return `/open-apis/bitable/v1/apps/${await getBitableAppToken()}/tables/${tableId}/records`;
}

async function fieldsPath(tableIdOrKey: string) {
  const tableId = isTableKey(tableIdOrKey)
    ? await getTableId(tableIdOrKey)
    : tableIdOrKey;
  return `/open-apis/bitable/v1/apps/${await getBitableAppToken()}/tables/${tableId}/fields`;
}

async function getTableFieldMeta(table: TableKey): Promise<TableFieldMeta> {
  const target = await getTableTarget(table);
  const key = cacheKey(target.appToken, target.tableId);
  const cached = fieldMetaCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    recordFieldsMetaPerf({ ms: 0, cacheHit: true });
    return cached.meta;
  }

  const startedAt = performance.now();

  const fields: RawField[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (pageToken) query.set("page_token", pageToken);
    const data = await bitableFetch<ListFieldsResponse>(
      `${await fieldsPath(table)}?${query.toString()}`
    );

    fields.push(...(data.items ?? []));
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);

  const fieldNames = new Set<string>();
  const optionNameByField: Record<string, Record<string, string>> = {};

  for (const field of fields) {
    fieldNames.add(field.field_name);
    const options = field.property?.options ?? field.options ?? [];
    const optionMap: Record<string, string> = {};

    for (const option of options) {
      const id = option.id ?? (option as { option_id?: string }).option_id;
      const name = option.name ?? option.text ?? option.value;
      if (id && name) optionMap[id] = String(name);
    }

    if (Object.keys(optionMap).length > 0) {
      optionNameByField[field.field_name] = optionMap;
    }
  }

  const meta = { fieldNames, optionNameByField };
  fieldMetaCache.set(key, {
    createdAt: Date.now(),
    expiresAt: Date.now() + FIELD_META_TTL_MS,
    meta,
    table
  });
  recordFieldsMetaPerf({ ms: performance.now() - startedAt, cacheHit: false });
  return meta;
}

export async function invalidateFieldMetaCache(table?: TableKey) {
  if (!table) {
    fieldMetaCache.clear();
    return;
  }

  const target = await getTableTarget(table);
  fieldMetaCache.delete(cacheKey(target.appToken, target.tableId));
}

export async function tableHasField(table: TableKey, fieldName: string) {
  return (await getTableFieldMeta(table)).fieldNames.has(fieldName);
}

export function resolveBitableRecordFields(
  table: string,
  record: RawRecord,
  meta: TableFieldMeta
) {
  const resolved: Record<string, unknown> = {};

  for (const [fieldName, value] of Object.entries(record.fields)) {
    resolved[fieldName] = resolveFieldValue(
      value,
      meta.optionNameByField[fieldName] ?? {},
      table,
      fieldName,
      record.record_id
    );
  }

  return resolved;
}

function resolveFieldValue(
  value: unknown,
  optionNameById: Record<string, string>,
  table: string,
  fieldName: string,
  recordId: string
): unknown {
  if (typeof value === "string") {
    return resolveOptionText(value, optionNameById, table, fieldName, recordId);
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      resolveFieldValue(item, optionNameById, table, fieldName, recordId)
    );
  }

  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    if (typeof raw.text === "string") return raw.text;
    if (typeof raw.name === "string") return raw.name;
    const optionId = raw.id ?? raw.option_id ?? raw.value;
    if (typeof optionId === "string") {
      const resolved = resolveOptionText(
        optionId,
        optionNameById,
        table,
        fieldName,
        recordId
      );
      if (resolved !== optionId) return resolved;
    }
  }

  return value;
}

function resolveOptionText(
  value: string,
  optionNameById: Record<string, string>,
  table: string,
  fieldName: string,
  recordId: string
) {
  const resolved = optionNameById[value];
  if (resolved) return resolved;

  if (/^opt[a-z0-9]+$/i.test(value)) {
    const warningKey = `${table}:${fieldName}:${value}`;
    if (unresolvedOptionWarnings.has(warningKey)) return value;
    unresolvedOptionWarnings.add(warningKey);
    console.warn("[Bitable option unresolved]", {
      table,
      fieldName,
      rawValue: value,
      recordId
    });
  }

  return value;
}

async function getFieldMetaByTarget(target: BitableTableTarget): Promise<TableFieldMeta> {
  const key = cacheKey(target.appToken, target.tableId);
  const cached = fieldMetaCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    recordFieldsMetaPerf({ ms: 0, cacheHit: true });
    return cached.meta;
  }

  const startedAt = performance.now();
  const fields: RawField[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (pageToken) query.set("page_token", pageToken);
    const data = await bitableFetch<ListFieldsResponse>(
      `/open-apis/bitable/v1/apps/${target.appToken}/tables/${target.tableId}/fields?${query.toString()}`
    );

    fields.push(...(data.items ?? []));
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);

  const fieldNames = new Set<string>();
  const optionNameByField: Record<string, Record<string, string>> = {};

  for (const field of fields) {
    fieldNames.add(field.field_name);
    const options = field.property?.options ?? field.options ?? [];
    const optionMap: Record<string, string> = {};

    for (const option of options) {
      const id = option.id ?? (option as { option_id?: string }).option_id;
      const name = option.name ?? option.text ?? option.value;
      if (id && name) optionMap[id] = String(name);
    }

    if (Object.keys(optionMap).length > 0) {
      optionNameByField[field.field_name] = optionMap;
    }
  }

  const meta = { fieldNames, optionNameByField };
  fieldMetaCache.set(key, {
    createdAt: Date.now(),
    expiresAt: Date.now() + FIELD_META_TTL_MS,
    meta,
    table: target.tableLabel ?? target.tableId
  });
  recordFieldsMetaPerf({ ms: performance.now() - startedAt, cacheHit: false });
  return meta;
}

export async function listRecordsFromBitable<T>(
  target: BitableTableTarget
): Promise<BitableRecord<T>[]> {
  const startedAt = performance.now();
  const records: BitableRecord<T>[] = [];
  const fieldMeta = await getFieldMetaByTarget(target);
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({ page_size: "500" });
    if (pageToken) query.set("page_token", pageToken);
    const data = await bitableFetch<ListResponse>(
      `/open-apis/bitable/v1/apps/${target.appToken}/tables/${target.tableId}/records?${query.toString()}`
    );

    for (const item of data.items ?? []) {
      records.push({
        recordId: item.record_id,
        fields: resolveBitableRecordFields(
          target.tableLabel ?? target.tableId,
          item,
          fieldMeta
        ) as T
      });
    }

    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);

  recordTablePerf({
    table: undefined,
    ms: performance.now() - startedAt,
    records: records.length,
    cache: {
      hit: false,
      cacheKey: cacheKey(target.appToken, target.tableId),
      ageMs: null,
      ttlMs: 0,
      missReason: "tableKeyMismatch"
    }
  });
  return records;
}

async function writableFieldsForTable<T extends Record<string, unknown>>(
  tableIdOrKey: string,
  fields: T
) {
  if (!isTableKey(tableIdOrKey)) return fields;

  const meta = await getTableFieldMeta(tableIdOrKey);
  const filtered: Record<string, unknown> = {};
  for (const [fieldName, value] of Object.entries(fields)) {
    if (meta.fieldNames.has(fieldName)) {
      filtered[fieldName] = value;
      continue;
    }

    console.warn("[Bitable field missing]", { table: tableIdOrKey, fieldName });
  }

  return filtered as T;
}

export async function listRecords<T>(
  tableIdOrKey: string,
  options: ListRecordsOptions = {}
): Promise<BitableRecord<T>[]> {
  const useCache = options.useCache !== false;
  const table = isTableKey(tableIdOrKey) ? tableIdOrKey : undefined;
  const cacheInfo = getRecordsCacheInfo(table, useCache);
  const cached = table && useCache ? recordCache.get(recordsCacheKey(table)) : undefined;
  if (cached && cacheInfo.hit) {
    const records = cached.records as BitableRecord<T>[];
    recordTablePerf({
      table,
      ms: 0,
      records: records.length,
      cache: cacheInfo
    });
    return records.map((record) => ({ ...record }));
  }

  const startedAt = performance.now();
  const records: BitableRecord<T>[] = [];
  let pageToken: string | undefined;
  const fieldMeta = table ? await getTableFieldMeta(table) : undefined;

  do {
    const query = new URLSearchParams({ page_size: "500" });
    if (pageToken) query.set("page_token", pageToken);
    const data = await bitableFetch<ListResponse>(
      `${await tablePath(tableIdOrKey)}?${query.toString()}`
    );

    for (const item of data.items ?? []) {
      records.push({
        recordId: item.record_id,
        fields: (table && fieldMeta
          ? resolveBitableRecordFields(table, item, fieldMeta)
          : item.fields) as T
      });
    }

    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);

  if (useCache && table) {
    recordCache.set(recordsCacheKey(table), {
      createdAt: Date.now(),
      expiresAt: Date.now() + RECORD_CACHE_TTL_MS[table],
      records: records as BitableRecord<unknown>[],
      cacheKey: recordsCacheKey(table)
    });
    recordCacheInvalidations.delete(table);
  }
  recordTablePerf({
    table,
    ms: performance.now() - startedAt,
    records: records.length,
    cache: cacheInfo
  });
  return records;
}

function getRecordsCacheInfo(
  table: TableKey | undefined,
  useCache: boolean
): TableCachePerf {
  if (!table) {
    return {
      hit: false,
      cacheKey: "",
      ageMs: null,
      ttlMs: 0,
      missReason: "tableKeyMismatch"
    };
  }

  const ttlMs = RECORD_CACHE_TTL_MS[table];
  const key = recordsCacheKey(table);
  if (!useCache) {
    return {
      hit: false,
      cacheKey: key,
      ageMs: null,
      ttlMs,
      missReason: "bypassed"
    };
  }

  const cached = recordCache.get(key);
  if (!cached) {
    const invalidation = recordCacheInvalidations.get(table);
    return {
      hit: false,
      cacheKey: key,
      ageMs: null,
      ttlMs,
      missReason: invalidation ? "invalidated" : "empty"
    };
  }

  const ageMs = Date.now() - cached.createdAt;
  if (cached.expiresAt <= Date.now()) {
    return {
      hit: false,
      cacheKey: key,
      ageMs,
      ttlMs,
      missReason: "expired"
    };
  }

  return {
    hit: true,
    cacheKey: key,
    ageMs,
    ttlMs,
    missReason: null
  };
}

export async function invalidateRecordsCache(table?: TableKey) {
  if (!table) {
    recordCache.clear();
    const now = Date.now();
    for (const key of Object.keys(TABLE_NAMES) as TableKey[]) {
      recordCacheInvalidations.set(key, {
        lastInvalidatedAt: now,
        invalidationReason: "manual_all"
      });
    }
    return;
  }

  recordCache.delete(recordsCacheKey(table));
  recordCacheInvalidations.set(table, {
    lastInvalidatedAt: Date.now(),
    invalidationReason: "write"
  });
}

export function getRecordsCacheTtlMs(table: TableKey) {
  return RECORD_CACHE_TTL_MS[table];
}

export function getFieldMetaCacheTtlMs() {
  return FIELD_META_TTL_MS;
}

export function getBitableCacheStatus() {
  const now = Date.now();
  const tables = Object.keys(TABLE_NAMES) as TableKey[];
  const records = Object.fromEntries(
    tables.map((table) => {
      const cached = recordCache.get(recordsCacheKey(table));
      const invalidation = recordCacheInvalidations.get(table);
      return [
        table,
        {
          hasCache: Boolean(cached && cached.expiresAt > now),
          cacheKey: recordsCacheKey(table),
          ageMs: cached ? now - cached.createdAt : null,
          ttlMs: RECORD_CACHE_TTL_MS[table],
          recordsCount: cached?.records.length ?? 0,
          lastInvalidatedAt: invalidation?.lastInvalidatedAt ?? null,
          invalidationReason: invalidation?.invalidationReason ?? null,
          expiresInMs: cached ? Math.max(0, cached.expiresAt - now) : 0
        }
      ];
    })
  ) as Record<
    TableKey,
    {
      hasCache: boolean;
      cacheKey: string;
      ageMs: number | null;
      ttlMs: number;
      recordsCount: number;
      lastInvalidatedAt: number | null;
      invalidationReason: string | null;
      expiresInMs: number;
    }
  >;

  const fieldsMeta = Object.fromEntries(
    tables.map((table) => {
      const entries = [...fieldMetaCache.values()].filter(
        (entry) => entry.table === table
      );
      const active = entries.find((entry) => entry.expiresAt > now);
      return [
        table,
        {
          hasCache: Boolean(active),
          ageMs: active ? now - active.createdAt : null,
          ttlMs: FIELD_META_TTL_MS,
          fieldsCount: active?.meta.fieldNames.size ?? 0,
          optionFieldsCount: active
            ? Object.keys(active.meta.optionNameByField).length
            : 0,
          expiresInMs: active ? Math.max(0, active.expiresAt - now) : 0
        }
      ];
    })
  ) as Record<
    TableKey,
    {
      hasCache: boolean;
      ageMs: number | null;
      ttlMs: number;
      fieldsCount: number;
      optionFieldsCount: number;
      expiresInMs: number;
    }
  >;

  return { records, fieldsMeta };
}

export function expireRecordsCacheForTest(table: TableKey) {
  const cached = recordCache.get(recordsCacheKey(table));
  if (!cached) return;
  recordCache.set(recordsCacheKey(table), {
    ...cached,
    expiresAt: Date.now() - 1
  });
}

export function resetBitableCachesForTest() {
  appTokenCache = undefined;
  tableIdCache = undefined;
  fieldMetaCache.clear();
  recordCache.clear();
  recordCacheInvalidations.clear();
  unresolvedOptionWarnings.clear();
}

export async function createRecord<T extends Record<string, unknown>>(
  tableIdOrKey: string,
  fields: T
) {
  const data = await bitableFetch<{ record: RawRecord }>(
    await tablePath(tableIdOrKey),
    {
      method: "POST",
      body: JSON.stringify({
        fields: await writableFieldsForTable(tableIdOrKey, fields)
      })
    }
  );

  if (isTableKey(tableIdOrKey)) {
    await invalidateRecordsCache(tableIdOrKey);
  }

  return {
    recordId: data.record.record_id,
    fields: data.record.fields as T
  };
}

export async function updateRecord<T extends Record<string, unknown>>(
  tableIdOrKey: string,
  recordId: string,
  fields: Partial<T>
) {
  const data = await bitableFetch<{ record: RawRecord }>(
    `${await tablePath(tableIdOrKey)}/${recordId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        fields: await writableFieldsForTable(tableIdOrKey, fields)
      })
    }
  );

  if (isTableKey(tableIdOrKey)) {
    await invalidateRecordsCache(tableIdOrKey);
  }

  return {
    recordId: data.record.record_id,
    fields: data.record.fields as T
  };
}
