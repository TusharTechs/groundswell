import { runCreativeDirector, type KitEvent } from "@/lib/kit/director";
import { isShowcaseKit } from "@/lib/kit/load";
import { KitInput } from "@/lib/kit/types";
import { admit, clientIp } from "@/lib/rate-limit";
import { eventStream } from "@/lib/sse";
import { saveCampaign } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const parsed = KitInput.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return Response.json({ error: "That plan can't be turned into a kit." }, { status: 400 });
  if (await isShowcaseKit(parsed.data.campaignId)) return Response.json({ error: "Recorded rehearsals already have their kit." }, { status: 409 });
  const admission = await admit(clientIp(req), "kit");
  if (!admission.ok) return Response.json({ error: admission.message }, { status: admission.status, headers: { "Retry-After": String(admission.retryAfter) } });
  return eventStream<KitEvent>(async (send) => {
    const kit = await runCreativeDirector(parsed.data, send);
    await saveCampaign(kit);
    send({ type: "kit", kit });
  }, admission.release);
}
