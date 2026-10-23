import { z } from "zod";
import { runLaunch } from "@/lib/agents/run";
import { CITIES } from "@/lib/atlas/cities";
import { admit, clientIp } from "@/lib/rate-limit";
import { eventStream } from "@/lib/sse";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  brief: z.string().trim().min(12, "Describe the launch in a sentence or two.").max(1500),
  cityId: z.enum(CITIES.map((c) => c.id) as [string, ...string[]]),
  budget: z.number().min(1000).max(250000).optional(),
  days: z.number().int().min(14).max(84).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  const admission = admit(clientIp(req), "rehearse");
  if (!admission.ok) return Response.json({ error: admission.message }, { status: admission.status, headers: { "Retry-After": String(admission.retryAfter) } });
  return eventStream((send) => runLaunch(parsed.data, send), admission.release);
}
