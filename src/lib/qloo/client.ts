// Server-side Qloo REST client. Never import this from a client component:
// it reads QLOO_API_KEY from the environment.
//
// Docs: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
// - Hackathon keys only work on https://hackathon.api.qloo.com
// - Auth header is X-Api-Key; all calls are GET with query-string params
// - Invalid params are silently ignored, so we whitelist them (see params.ts)

import { assertKnownParams } from "./params";

export const DEFAULT_BASE_URL = "https://hackathon.api.qloo.com";

export type QlooErrorCode =
  | "missing_key"
  | "auth"
  | "rate_limited"
  | "bad_request"
  | "forbidden"
  | "not_found"
  | "server"
  | "timeout"
  | "network";

export class QlooError extends Error {
  constructor(
    public code: QlooErrorCode,
    message: string,
    public status?: number,
    public retryable = false,
    /** Server-suggested wait before retrying, from Retry-After. */
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = "QlooError";
  }
}

export type QlooParams = Record<string, string | number | boolean | undefined>;

export interface QlooCall<T> {
  data: T;
  meta: {
    callId: string;
    path: string;
    params: Record<string, string>;
    status: number;
    ms: number;
    cached: boolean;
  };
}

interface Options {
  timeoutMs?: number;
  retries?: number;
  cacheTtlMs?: number;
}

const cache = new Map<string, { at: number; value: QlooCall<unknown> }>();
const pending = new Map<string, Promise<QlooCall<unknown>>>();

// Hackathon keys allow 5 requests a second (x-second-ratelimit-*) and a fixed
// monthly quota (x-month-ratelimit-*), so keep a few requests in flight and
// space their starts out.
const MAX_IN_FLIGHT = 3;
const MIN_SPACING_MS = 220;
let inFlight = 0;
let nextStart = 0;
const waiters: (() => void)[] = [];
async function acquire() {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((r) => waiters.push(r));
  inFlight++;
  const now = Date.now();
  const at = Math.max(now, nextStart);
  nextStart = at + MIN_SPACING_MS;
  if (at > now) await sleep(at - now);
}
function release() {
  inFlight--;
  waiters.shift()?.();
}
const CACHE_MAX = 500;
let callCounter = 0;

/** What Qloo last reported about the monthly quota, and how many calls this process made. */
const usage = { networkCalls: 0, monthRemaining: null as number | null, monthLimit: null as number | null };
export function qlooUsage() {
  return { ...usage };
}

// Scripts (not the app) can keep responses on disk so reruns cost no quota.
async function diskCache() {
  const dir = process.env.QLOO_DISK_CACHE;
  if (!dir) return null;
  const [{ mkdir, readFile, writeFile }, { createHash }, { join }] = await Promise.all([
    import("node:fs/promises"),
    import("node:crypto"),
    import("node:path"),
  ]);
  await mkdir(dir, { recursive: true });
  const file = (url: string) => join(dir, `${createHash("sha1").update(url).digest("hex")}.json`);
  return {
    get: async (url: string) => {
      try {
        return JSON.parse(await readFile(file(url), "utf8")) as QlooCall<unknown>;
      } catch {
        return null;
      }
    },
    set: (url: string, value: QlooCall<unknown>) => writeFile(file(url), JSON.stringify(value)),
  };
}

function config() {
  const key = process.env.QLOO_API_KEY;
  if (!key) {
    throw new QlooError(
      "missing_key",
      "QLOO_API_KEY is not set. Add it to .env.local (see .env.example).",
    );
  }
  const baseUrl = (process.env.QLOO_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  return { key, baseUrl };
}

function normalise(params: QlooParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v === undefined || v === "") continue;
    out[k] = String(v);
  }
  return out;
}

function classify(status: number, body: string, retryAfter: string | null): QlooError {
  const snippet = body.slice(0, 300);
  if (status === 401) return new QlooError("auth", `Qloo rejected the API key (401). ${snippet}`, status);
  if (status === 403) return new QlooError("forbidden", `Qloo returned 403, often an unsupported filter.type. ${snippet}`, status);
  if (status === 404) return new QlooError("not_found", `Qloo returned 404. ${snippet}`, status);
  if (status === 429) {
    const seconds = Number(retryAfter);
    return new QlooError("rate_limited", "Qloo rate limit reached (429).", status, true, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined);
  }
  if (status >= 500) return new QlooError("server", `Qloo server error (${status}).`, status, true);
  return new QlooError("bad_request", `Qloo returned ${status}. ${snippet}`, status);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function qlooGet<T = unknown>(
  path: string,
  params: QlooParams = {},
  { timeoutMs = 8000, retries = 3, cacheTtlMs = 60 * 60 * 1000 }: Options = {},
): Promise<QlooCall<T>> {
  const { key, baseUrl } = config();
  assertKnownParams(path, params);
  const query = normalise(params);
  const qs = new URLSearchParams(query).toString();
  const url = `${baseUrl}${path}${qs ? `?${qs}` : ""}`;
  const callId = `q${++callCounter}`;

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < cacheTtlMs) {
    return { ...(hit.value as QlooCall<T>), meta: { ...hit.value.meta, callId, cached: true } };
  }
  // Identical requests already on the wire share one response.
  const shared = pending.get(url);
  if (shared) {
    const value = (await shared) as QlooCall<T>;
    return { ...value, meta: { ...value.meta, callId, cached: true } };
  }
  const work = (async () => {
    const disk = await diskCache();
    const stored = await disk?.get(url);
    if (stored) return { ...(stored as QlooCall<T>), meta: { ...stored.meta, callId, cached: true } };
    const value = await fetchWithRetry<T>(url, key, path, query, callId, timeoutMs, retries);
    await disk?.set(url, value as QlooCall<unknown>);
    return value;
  })();
  pending.set(url, work as Promise<QlooCall<unknown>>);
  try {
    return await work;
  } finally {
    pending.delete(url);
  }
}

async function fetchWithRetry<T>(
  url: string,
  key: string,
  path: string,
  query: Record<string, string>,
  callId: string,
  timeoutMs: number,
  retries: number,
): Promise<QlooCall<T>> {
  const baseDelay = Number(process.env.QLOO_RETRY_BASE_MS ?? 500);
  let attempt = 0;
  for (;;) {
    let delay = 0;
    const started = Date.now();
    await acquire();
    try {
      const res = await fetch(url, {
        headers: { "X-Api-Key": key, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      const text = await res.text();
      usage.networkCalls++;
      const remaining = Number(res.headers.get("x-month-ratelimit-remaining") ?? NaN);
      const limit = Number(res.headers.get("x-month-ratelimit-limit") ?? NaN);
      if (Number.isFinite(remaining)) usage.monthRemaining = remaining;
      if (Number.isFinite(limit)) usage.monthLimit = limit;
      if (!res.ok) throw classify(res.status, text, res.headers.get("retry-after"));
      const value: QlooCall<T> = {
        data: JSON.parse(text) as T,
        meta: { callId, path, params: query, status: res.status, ms: Date.now() - started, cached: false },
      };
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(url, { at: Date.now(), value });
      return value;
    } catch (err) {
      const e =
        err instanceof QlooError
          ? err
          : err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
            ? new QlooError("timeout", `Qloo did not answer within ${timeoutMs} ms.`, undefined, true)
            : new QlooError("network", `Could not reach Qloo: ${(err as Error).message}`, undefined, true);
      if (!e.retryable || attempt >= retries) throw e;
      attempt++;
      delay = e.retryAfterMs ?? baseDelay * 2 ** (attempt - 1) + Math.random() * baseDelay;
    } finally {
      release();
    }
    await sleep(delay); // wait outside the in-flight slot
  }
}
