import { loadKit } from "@/lib/kit/load";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kit = await loadKit(id);
  // No kit yet is a normal state for a fresh rehearsal: answer 204 rather than an error.
  if (!kit) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  return Response.json(kit, { headers: { "Cache-Control": "no-store" } });
}
