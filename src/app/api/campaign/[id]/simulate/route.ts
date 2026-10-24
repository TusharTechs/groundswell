// Add a week of simulated scans to a campaign (for demonstrating mission
// control), or clear them. Simulated scans are stored and shown as simulated.

import { campaignDay } from "@/lib/campaign/report";
import { simulateWeek } from "@/lib/campaign/simulate";
import { loadKit } from "@/lib/kit/load";
import { admit, clientIp } from "@/lib/rate-limit";
import { clearReplan, clearSimulatedScans, recordScans, scansFor } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kit = await loadKit(id);
  if (!kit) return Response.json({ error: "No campaign with that id." }, { status: 404 });
  const admission = admit(clientIp(req), "light");
  if (!admission.ok) return Response.json({ error: admission.message }, { status: admission.status });
  const simulated = (await scansFor(id)).filter((s) => s.simulated);
  const fromDay = simulated.length ? Math.max(...simulated.map((s) => campaignDay(kit, new Date(s.at)))) + 1 : 0;
  if (fromDay >= kit.input.days) return Response.json({ error: "The simulation has reached launch day. Reset it to start again." }, { status: 409 });
  const week = simulateWeek(kit, fromDay);
  await recordScans(id, week);
  return Response.json({ added: week.length, fromDay, toDay: Math.min(kit.input.days, fromDay + 7) - 1 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kit = await loadKit(id);
  if (!kit) return Response.json({ error: "No campaign with that id." }, { status: 404 });
  const admission = admit(clientIp(req), "light");
  if (!admission.ok) return Response.json({ error: admission.message }, { status: admission.status });
  await Promise.all([clearSimulatedScans(id), clearReplan(id)]);
  return Response.json({ ok: true });
}
