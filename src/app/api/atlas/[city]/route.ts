import { loadAtlas } from "@/lib/atlas/store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  try {
    const atlas = await loadAtlas(city);
    return Response.json(atlas, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
  } catch {
    return Response.json({ error: `No atlas for "${city}".` }, { status: 404 });
  }
}
