import { AsyncLocalStorage } from "node:async_hooks";
import type { TableKey } from "./bitable";

type RecordsCount = Partial<Record<TableKey, number>>;
type CacheHits = Partial<Record<`${TableKey}Hit`, boolean>> & {
  fieldsMetaHit?: boolean;
};

type PerfState = {
  endpoint: string;
  startedAt: number;
  tableMs: Partial<Record<TableKey, number>>;
  fieldsMetaMs: number;
  normalizeMs: number;
  recordsCount: RecordsCount;
  cache: CacheHits;
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
  cacheHit: boolean;
}) {
  const state = storage.getStore();
  if (!state || !input.table) return;

  state.tableMs[input.table] = (state.tableMs[input.table] ?? 0) + input.ms;
  state.recordsCount[input.table] = input.records;
  const key = `${input.table}Hit` as const;
  state.cache[key] =
    state.cache[key] === undefined
      ? input.cacheHit
      : state.cache[key] && input.cacheHit;
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
    peopleHit: state.cache.peopleHit ?? false,
    accountsHit: state.cache.accountsHit ?? false,
    dailyHit: state.cache.dailyHit ?? false,
    reviewsHit: state.cache.reviewsHit ?? false,
    rankingsHit: state.cache.rankingsHit ?? false,
    pushLogsHit: state.cache.pushLogsHit ?? false
  };

  return output;
}

function roundMs(value: number) {
  return Math.round(value);
}
