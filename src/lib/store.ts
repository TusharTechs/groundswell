// Durable state for campaigns: launch kits and tracked-link scans. Postgres
// (for example Neon on Vercel) when DATABASE_URL is set; otherwise process
// memory, mirrored to .data/ in development so restarts keep it.

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { Kit } from "./kit/types";
import type { RecordedRun } from "./showcase";

export interface Scan {
  code: string;
  at: string;
  /** Coarse country from the hosting platform's geo header, when present. */
  country: string | null;
  /** True when produced by "simulate a week" rather than a real scan. */
  simulated: boolean;
}

type Memory = { campaigns: Record<string, Kit>; scans: Record<string, Scan[]>; replans: Record<string, unknown>; runs: Record<string, RecordedRun> };

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
let sql: NeonQueryFunction<false, false> | null = null;
let ready: Promise<void> | null = null;
const memory: Memory = { campaigns: {}, scans: {}, replans: {}, runs: {} };
let loaded = false;

export const storeKind = (): "postgres" | "memory" => (url ? "postgres" : "memory");

async function db() {
  if (!url) return null;
  if (!sql) sql = neon(url);
  if (!ready) {
    const q = sql;
    ready = (async () => {
      await q`create table if not exists gs_campaigns (id text primary key, kit jsonb not null, created_at timestamptz not null default now())`;
      await q`create table if not exists gs_scans (id bigserial primary key, campaign text not null, code text not null, at timestamptz not null default now(), country text, simulated boolean not null default false)`;
      await q`create index if not exists gs_scans_campaign on gs_scans (campaign)`;
      await q`create table if not exists gs_replans (campaign text primary key, replan jsonb not null, created_at timestamptz not null default now())`;
      await q`create table if not exists gs_runs (id text primary key, run jsonb not null, created_at timestamptz not null default now())`;
    })();
    ready.catch(() => (ready = null));
  }
  await ready;
  return sql;
}

const devFile = () => (process.env.NODE_ENV === "development" ? ".data/store.json" : null);

async function memoryLoad() {
  if (loaded) return;
  loaded = true;
  const f = devFile();
  if (!f) return;
  try {
    const { readFile } = await import("node:fs/promises");
    Object.assign(memory, JSON.parse(await readFile(f, "utf8")));
  } catch {
    // First run: nothing saved yet.
  }
}

async function memorySave() {
  const f = devFile();
  if (!f) return;
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(".data", { recursive: true });
  await writeFile(f, JSON.stringify(memory));
}

export async function saveCampaign(kit: Kit) {
  const q = await db();
  if (q) {
    await q`insert into gs_campaigns (id, kit) values (${kit.campaignId}, ${JSON.stringify(kit)}::jsonb) on conflict (id) do update set kit = excluded.kit`;
    return;
  }
  await memoryLoad();
  memory.campaigns[kit.campaignId] = kit;
  await memorySave();
}

export async function loadCampaign(id: string): Promise<Kit | null> {
  const q = await db();
  if (q) {
    const rows = (await q`select kit from gs_campaigns where id = ${id}`) as { kit: Kit }[];
    return rows[0]?.kit ?? null;
  }
  await memoryLoad();
  return memory.campaigns[id] ?? null;
}

/** Record scans; each takes its own time when given, else now. */
export async function recordScans(campaign: string, scans: (Omit<Scan, "at"> & { at?: string })[]) {
  if (!scans.length) return;
  const now = new Date().toISOString();
  const rows = scans.map((s) => ({ code: s.code, at: s.at ?? now, country: s.country, simulated: s.simulated }));
  const q = await db();
  if (q) {
    // One statement for the batch: the rows travel as a single JSON parameter.
    await q`insert into gs_scans (campaign, code, at, country, simulated)
      select ${campaign}, r.code, r.at, r.country, r.simulated
      from json_to_recordset(${JSON.stringify(rows)}::json) as r(code text, at timestamptz, country text, simulated boolean)`;
    return;
  }
  await memoryLoad();
  (memory.scans[campaign] ??= []).push(...rows);
  await memorySave();
}

export async function scansFor(campaign: string): Promise<Scan[]> {
  const q = await db();
  if (q) {
    const rows = (await q`select code, at, country, simulated from gs_scans where campaign = ${campaign} order by at`) as {
      code: string;
      at: string | Date;
      country: string | null;
      simulated: boolean;
    }[];
    return rows.map((r) => ({ code: r.code, at: new Date(r.at).toISOString(), country: r.country, simulated: r.simulated }));
  }
  await memoryLoad();
  return memory.scans[campaign] ?? [];
}

export async function clearSimulatedScans(campaign: string) {
  const q = await db();
  if (q) {
    await q`delete from gs_scans where campaign = ${campaign} and simulated = true`;
    return;
  }
  await memoryLoad();
  memory.scans[campaign] = (memory.scans[campaign] ?? []).filter((s) => !s.simulated);
  await memorySave();
}

/** The Field Analyst's latest re-plan for a campaign. */
export async function saveReplan(campaign: string, replan: unknown) {
  const q = await db();
  if (q) {
    await q`insert into gs_replans (campaign, replan) values (${campaign}, ${JSON.stringify(replan)}::jsonb) on conflict (campaign) do update set replan = excluded.replan, created_at = now()`;
    return;
  }
  await memoryLoad();
  memory.replans[campaign] = replan;
  await memorySave();
}

export async function loadReplan<T>(campaign: string): Promise<T | null> {
  const q = await db();
  if (q) {
    const rows = (await q`select replan from gs_replans where campaign = ${campaign}`) as { replan: T }[];
    return rows[0]?.replan ?? null;
  }
  await memoryLoad();
  return (memory.replans[campaign] as T | undefined) ?? null;
}

export async function clearReplan(campaign: string) {
  const q = await db();
  if (q) {
    await q`delete from gs_replans where campaign = ${campaign}`;
    return;
  }
  await memoryLoad();
  delete memory.replans[campaign];
  await memorySave();
}

/** A finished live rehearsal, every event with its timing, so it can be replayed and shared. */
export async function saveRun(run: RecordedRun) {
  const q = await db();
  if (q) {
    await q`insert into gs_runs (id, run) values (${run.id}, ${JSON.stringify(run)}::jsonb) on conflict (id) do nothing`;
    return;
  }
  await memoryLoad();
  memory.runs[run.id] = run;
  await memorySave();
}

export async function loadRun(id: string): Promise<RecordedRun | null> {
  const q = await db();
  if (q) {
    const rows = (await q`select run from gs_runs where id = ${id}`) as { run: RecordedRun }[];
    return rows[0]?.run ?? null;
  }
  await memoryLoad();
  return memory.runs[id] ?? null;
}
