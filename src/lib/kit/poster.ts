// The poster URL for one neighbourhood's copy, optionally for one partner's
// tracked QR code. Shared by the launch kit (browser) and pages (server).

import { linkUrl } from "./build";
import { langOf, localDate } from "./i18n";
import type { Kit, KitInput } from "./types";

function b64url(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function posterPath(
  kit: Pick<Kit, "zones" | "campaignId">,
  input: KitInput,
  zoneId: number,
  opts: { origin: string; partner?: KitInput["partners"][number]; code?: string; color?: [number, number, number]; demo: boolean },
): string {
  const copy = kit.zones.find((z) => z.zoneId === zoneId);
  if (!copy) return "";
  const lang = langOf(input.language);
  return `/api/poster?d=${b64url(
    JSON.stringify({
      t: input.title,
      h: copy.posterHeadline,
      s: copy.posterSubline,
      v: input.venue ?? undefined,
      dt: localDate(input.launchDate, lang),
      f: input.comps.length ? input.comps.slice(0, 3).join(", ") : undefined,
      p: opts.partner?.name,
      q: linkUrl(opts.origin, input.campaignId, opts.code ?? `z${zoneId}ig`),
      c: opts.color,
      demo: opts.demo,
      l: lang,
    }),
  )}`;
}
