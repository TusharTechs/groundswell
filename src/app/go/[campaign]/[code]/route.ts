// Tracked links from posters, posts, podcast reads and emails: record the scan,
// then forward to the launch link (or the campaign's launch page).

import { loadKit } from "@/lib/kit/load";
import { recordScans } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ campaign: string; code: string }> }) {
  const { campaign, code } = await params;
  const kit = await loadKit(campaign);
  const origin = new URL(req.url).origin;
  if (!kit || !kit.links.some((l) => l.code === code)) return Response.redirect(`${origin}/`, 302);
  // Link-preview bots (chat apps, social sites) fetch links too; don't count them as scans.
  const ua = req.headers.get("user-agent") ?? "";
  const bot = /bot|crawler|spider|preview|facebookexternalhit|slackbot|whatsapp|telegram|discord|twitterbot|linkedin/i.test(ua);
  if (!bot) await recordScans(campaign, [{ code, country: req.headers.get("x-vercel-ip-country"), simulated: false }]).catch(() => undefined);
  const target = kit.input.launchUrl ?? `${origin}/l/${campaign}?from=${encodeURIComponent(code)}`;
  return Response.redirect(target, 302);
}
