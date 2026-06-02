import { AsyncLocalStorage } from "node:async_hooks";
import type { TableKey } from "./bitable";

type RecordsCount = Partial<Record<TableKey, number>>;
export type CacheMissReason =
  | "empty"
  | "expired"
  | "invalidated"
  | "bypassed"
  | "disabled"
  | "tableKeyMismatch";

export type TableCachePerf = {
  hit: boolean;
  cacheKey: string;
  ageMs: number | null;
  ttlMs: number;
  missReason: CacheMissReason | null;
};

type CacheState = Partial<Record<TableKey, TableCachePerf>> & {
  fieldsMetaHit?: boolean;
};

type PerfState = {
  endpoint: string;
  startedAt: number;
  tableMs: Partial<Record<TableKey, number>>;
  fieldsMetaMs: number;
  normalizeMs: number;
  recordsCount: RecordsCount;
  cache: CacheState;
};

const TABLES: TableKey[] = [
  "people",
  "accounts",
  "daily",
  "reviews",
  "rankings",
  "pushLogs"
];

const storage = new AsyncLocalStorage<PerfState>();

export async function withApiPerf<T>(
  endpoint: string,
  handler: () => Promise<T>
): Promise<T> {
  const state: PerfState = {
    endpoint,
    startedAt: performance.now(),
    tableMs: {},
    fieldsMetaMs: 0,
    normalizeMs: 0,
    recordsCount: {},
    cache: {}
  };

  return storage.run(state, async () => {
    try {
      return await handler();
    } finally {
      console.info(`[Perf] ${endpoint}`, buildPerfLog(state));
    }
  });
}

export function recordTablePerf(input: {
  table?: TableKey;
  ms: number;
  records: number;
  cache: TableCachePerf;
}) {
  const state = storage.getStore();
  if (!state || !input.table) return;

  state.tableMs[input.table] = (state.tableMs[input.table] ?? 0) + input.ms;
  state.recordsCount[input.table] = input.records;
  state.cache[input.table] = input.cache;
}

export function recordFieldsMetaPerf(input: { ms: number; cacheHit: boolean }) {
  const state = storage.getStore();
  if (!state) return;

  state.fieldsMetaMs += input.ms;
  state.cache.fieldsMetaHit =
    state.cache.fieldsMetaHit === undefined
      ? input.cacheHit
      : state.cache.fieldsMetaHit && input.cacheHit;
}

export function recordNormalizePerf(ms: number) {
  const state = storage.getStore();
  if (!state) return;
  state.normalizeMs += ms;
}

export function buildPerfLog(state: PerfState) {
  const output: Record<string, unknown> = {
    totalMs: roundMs(performance.now() - state.startedAt)
  };

  for (const table of TABLES) {
    const key = `${table}Ms`;
    output[key] = roundMs(state.tableMs[table] ?? 0);
  }

  output.fieldsMetaMs = roundMs(state.fieldsMetaMs);
  output.normalizeMs = roundMs(state.normalizeMs);
  output.recordsCount = {
    people: state.recordsCount.people ?? 0,
    accounts: state.recordsCount.accounts ?? 0,
    daily: state.recordsCount.daily ?? 0,
    reviews: state.recordsCount.reviews ?? 0,
    rankings: state.recordsCount.rankings ?? 0,
    pushLogs: state.recordsCount.pushLogs ?? 0
  };
  output.cache = {
    fieldsMetaHit: state.cache.fieldsMetaHit ?? false,
    people: state.cache.people ?? emptyCachePerf("people"),
    accounts: state.cache.accounts ?? emptyCachePerf("accounts"),
    daily: state.cache.daily ?? emptyCachePerf("daily"),
    reviews: state.cache.reviews ?? emptyCachePerf("reviews"),
    rankings: state.cache.rankings ?? emptyCachePerf("rankings"),
    pushLogs: state.cache.pushLogs ?? emptyCachePerf("pushLogs")
  };

  return output;
}

function roundMs(value: number) {
  return Math.round(value);
}

function emptyCachePerf(table: TableKey): TableCachePerf {
  return {
    hit: false,
    cacheKey: table,
    ageMs: null,
    ttlMs: 0,
    missReason: "disabled"
  };
}
