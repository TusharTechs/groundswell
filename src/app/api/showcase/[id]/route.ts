import { loadShowcase } from "@/lib/showcase";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await loadShowcase(id);
  if (!run) return Response.json({ error: "No such recorded rehearsal." }, { status: 404 });
  return Response.json(run, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
