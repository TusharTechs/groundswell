// Best-effort, per-instance limits that protect the shared Qloo and Claude quotas.
// A live rehearsal costs roughly 15–25 Qloo calls and 20–30 Claude calls.

const WINDOW_MS = 30 * 60 * 1000;
const PER_IP: Record<Bucket, number> = { rehearse: 4, kit: 6, analyst: 6, light: 60 };
export type Bucket = "rehearse" | "kit" | "analyst" | "light";
const MAX_CONCURRENT = 3;

const hits = new Map<string, number[]>();
let running = 0;

export type Admission = { ok: true; release: () => void } | { ok: false; status: 429 | 503; message: string; retryAfter: number };

export function admit(ip: string, bucket: Bucket = "rehearse"): Admission {
  const now = Date.now();
  const key = `${bucket}:${ip}`;
  const limit = PER_IP[bucket];
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
    return {
      ok: false,
      status: 429,
      message:
        bucket === "kit" || bucket === "analyst"
          ? `${bucket === "kit" ? "Launch kits" : "Field Analyst runs"} are limited to ${limit} per half hour. Try again in about ${Math.ceil(retryAfter / 60)} min.`
          : bucket === "light"
            ? `Too many requests. Try again in about ${Math.ceil(retryAfter / 60)} min.`
            : `Live rehearsals are limited to ${limit} per half hour so the shared quota lasts. Try again in about ${Math.ceil(retryAfter / 60)} min, or watch a recorded one.`,
      retryAfter,
    };
  }
  if (bucket !== "light" && running >= MAX_CONCURRENT) {
    return { ok: false, status: 503, message: "The team is busy with other rehearsals. Try again in a minute, or watch a recorded one.", retryAfter: 30 };
  }
  recent.push(now);
  hits.set(key, recent);
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
