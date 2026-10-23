import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET() {
  try {
    const twins = JSON.parse(await readFile(join(process.cwd(), "data", "atlas", "twins.json"), "utf8"));
    return Response.json(twins, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
  } catch {
    return Response.json([], { status: 404 });
  }
}
