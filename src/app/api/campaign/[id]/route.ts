import { replanIn, scansIn, scopeOf } from "@/lib/campaign/scope";
import { loadKit } from "@/lib/kit/load";
import { storeKind } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kit = await loadKit(id);
  if (!kit) return Response.json({ error: "No campaign with that id." }, { status: 404 });
  const scope = await scopeOf(id, req);
  if ("error" in scope) return Response.json({ error: scope.error }, { status: 400 });
  const [scans, replan] = await Promise.all([scansIn(scope), replanIn(scope)]);
  return Response.json({ scans, replan, store: storeKind(), personal: scope.showcase }, { headers: { "Cache-Control": "no-store" } });
}
