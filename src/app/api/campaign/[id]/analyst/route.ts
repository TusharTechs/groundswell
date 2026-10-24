import { runFieldAnalyst, type AnalystEvent } from "@/lib/campaign/analyst";
import { loadKit } from "@/lib/kit/load";
import { admit, clientIp } from "@/lib/rate-limit";
import { eventStream } from "@/lib/sse";
import { saveReplan, scansFor } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kit = await loadKit(id);
  if (!kit) return Response.json({ error: "No campaign with that id." }, { status: 404 });
  const scans = await scansFor(id);
  if (!scans.length) return Response.json({ error: "No scans yet. Scan a QR code or simulate a week first." }, { status: 409 });
  const admission = admit(clientIp(req), "analyst");
  if (!admission.ok) return Response.json({ error: admission.message }, { status: admission.status, headers: { "Retry-After": String(admission.retryAfter) } });
  return eventStream<AnalystEvent>(async (send) => {
    const replan = await runFieldAnalyst(kit, scans, send);
    await saveReplan(id, replan);
    send({ type: "replan", replan });
  }, admission.release);
}
