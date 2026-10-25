// Limits that protect the shared Qloo and Claude quotas: per visitor per half
// hour, a daily cap for everyone together, and a few runs at once per server.
// With a database the counts are shared by every server instance and keyed by
// a one-way hash of the IP address; without one they live in this process.
// A live rehearsal costs roughly 25–55 Qloo requests and 25–30 Claude calls.

import { createHash } from "node:crypto";
import { addHit, countHits } from "./store";

const WINDOW_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export type Bucket = "rehearse" | "kit" | "analyst" | "light";
const PER_VISITOR: Record<Bucket, number> = { rehearse: 4, kit: 6, analyst: 6, light: 60 };
/** Across all visitors, per day; DAILY_REHEARSALS overrides the first. */
const PER_DAY: Partial<Record<Bucket, number>> = { rehearse: Number(process.env.DAILY_REHEARSALS) || 120, kit: 300, analyst: 400 };
const MAX_CONCURRENT = 3;

const memory = new Map<string, number[]>();
let running = 0;

export type Admission = { ok: true; release: () => void } | { ok: false; status: 429 | 503; message: string; retryAfter: number };

const visitorKey = (bucket: Bucket, ip: string) =>
  `${bucket}:${createHash("sha256")
    .update(`${process.env.RATE_LIMIT_SALT ?? "groundswell"}:${ip}`)
    .digest("hex")
    .slice(0, 24)}`;

async function count(key: string, windowMs: number): Promise<number> {
  const shared = await countHits(key, windowMs).catch(() => null);
  if (shared !== null) return shared;
  const now = Date.now();
  return (memory.get(key) ?? []).filter((t) => now - t < windowMs).length;
}

async function hit(key: string) {
  const now = Date.now();
  memory.set(key, [...(memory.get(key) ?? []).filter((t) => now - t < DAY_MS), now]);
  await addHit(key).catch(() => undefined);
}

const what: Record<Bucket, string> = { rehearse: "Live rehearsals", kit: "Launch kits", analyst: "Field Analyst runs", light: "Requests" };

export async function admit(ip: string, bucket: Bucket = "rehearse"): Promise<Admission> {
  const mine = visitorKey(bucket, ip);
  const all = `${bucket}:all`;
  const [used, usedToday] = await Promise.all([count(mine, WINDOW_MS), PER_DAY[bucket] ? count(all, DAY_MS) : Promise.resolve(0)]);
  if (used >= PER_VISITOR[bucket]) {
    return {
      ok: false,
      status: 429,
      message:
        bucket === "rehearse"
          ? `Live rehearsals are limited to ${PER_VISITOR[bucket]} per half hour so the shared quota lasts. Try again later, or watch a recorded one.`
          : `${what[bucket]} are limited to ${PER_VISITOR[bucket]} per half hour. Try again later.`,
      retryAfter: Math.ceil(WINDOW_MS / 1000),
    };
  }
  const cap = PER_DAY[bucket];
  if (cap && usedToday >= cap) {
    return { ok: false, status: 429, message: `Today's ${what[bucket].toLowerCase()} are used up. Try again tomorrow${bucket === "rehearse" ? ", or watch a recorded one" : ""}.`, retryAfter: 3600 };
  }
  if (bucket !== "light" && running >= MAX_CONCURRENT) {
    return { ok: false, status: 503, message: "The team is busy with other rehearsals. Try again in a minute, or watch a recorded one.", retryAfter: 30 };
  }
  await Promise.all([hit(mine), cap ? hit(all) : Promise.resolve()]);
  if (bucket !== "light") running++;
  let released = false;
  return {
    ok: true,
    release: () => {
      if (!released && bucket !== "light") {
        released = true;
        running--;
      }
    },
  };
}

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
