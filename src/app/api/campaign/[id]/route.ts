import { loadKit } from "@/lib/kit/load";
import { loadReplan, scansFor, storeKind } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kit = await loadKit(id);
  if (!kit) return Response.json({ error: "No campaign with that id." }, { status: 404 });
  const [scans, replan] = await Promise.all([scansFor(id), loadReplan(id)]);
  return Response.json({ scans, replan, store: storeKind() }, { headers: { "Cache-Control": "no-store" } });
}
