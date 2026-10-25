import { runFieldAnalyst, type AnalystEvent } from "@/lib/campaign/analyst";
import { scansIn, scopeOf } from "@/lib/campaign/scope";
import { loadKit } from "@/lib/kit/load";
import { admit, clientIp } from "@/lib/rate-limit";
import { eventStream } from "@/lib/sse";
import { saveReplan } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kit = await loadKit(id);
  if (!kit) return Response.json({ error: "No campaign with that id." }, { status: 404 });
  const scope = await scopeOf(id, req);
  if ("error" in scope) return Response.json({ error: scope.error }, { status: 400 });
  const scans = await scansIn(scope);
  if (!scans.length) return Response.json({ error: "No scans yet. Scan a QR code or simulate a week first." }, { status: 409 });
  const admission = await admit(clientIp(req), "analyst");
  if (!admission.ok) return Response.json({ error: admission.message }, { status: admission.status, headers: { "Retry-After": String(admission.retryAfter) } });
  return eventStream<AnalystEvent>(async (send) => {
    const replan = await runFieldAnalyst(kit, scans, send);
    await saveReplan(scope.own, replan);
    send({ type: "replan", replan });
  }, admission.release);
}
