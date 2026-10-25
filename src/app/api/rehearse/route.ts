import { z } from "zod";
import type { LaunchEvent } from "@/lib/agents/events";
import { runLaunch } from "@/lib/agents/run";
import { CITIES } from "@/lib/atlas/cities";
import { admit, clientIp } from "@/lib/rate-limit";
import { eventStream } from "@/lib/sse";
import { saveRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  brief: z.string().trim().min(12, "Describe the launch in a sentence or two.").max(1500),
  cityId: z.enum(CITIES.map((c) => c.id) as [string, ...string[]]),
  budget: z.number().min(1000).max(250000).optional(),
  days: z.number().int().min(14).max(84).optional(),
  launchUrl: z.string().url().max(500).startsWith("https://").optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  const admission = await admit(clientIp(req), "rehearse");
  if (!admission.ok) return Response.json({ error: admission.message }, { status: admission.status, headers: { "Retry-After": String(admission.retryAfter) } });
  const { launchUrl, ...input } = parsed.data;
  return eventStream<LaunchEvent>(async (send) => {
    const t0 = Date.now();
    const events: { t: number; e: LaunchEvent }[] = [];
    const s = await runLaunch(input, (e) => {
      events.push({ t: Date.now() - t0, e });
      send(e);
    });
    // Save the finished run so it can be replayed and shared; a failed save only costs the link.
    const id = `run-${s.runId}`;
    const saved = await saveRun({ id, cityId: input.cityId, brief: input.brief, recordedAt: new Date(t0).toISOString(), launchUrl: launchUrl ?? null, events }).then(
      () => true,
      () => false,
    );
    if (saved) send({ type: "saved", id });
  }, admission.release);
}
