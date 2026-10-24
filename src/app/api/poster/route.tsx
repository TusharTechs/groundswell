// A printable poster for one partner place: the zone's headline in its
// district colour, the date and venue, "for fans of" the comparables, and a
// QR code to that partner's tracked link.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { z } from "zod";
import { LABELS } from "@/lib/kit/i18n";

export const runtime = "nodejs";

const Poster = z.object({
  t: z.string().max(120),
  h: z.string().max(80),
  s: z.string().max(160),
  v: z.string().max(160).optional(),
  dt: z.string().max(60),
  /** The comparables, for the "for fans of" line. */
  f: z.string().max(160).optional(),
  p: z.string().max(120).optional(),
  q: z.string().url().max(300),
  c: z.tuple([z.number(), z.number(), z.number()]).optional(),
  demo: z.boolean().optional(),
  /** Language of the fixed labels. */
  l: z.enum(["en", "es", "ja"]).optional(),
});

export type PosterData = z.infer<typeof Poster>;

type Font = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700 | 800; style: "normal" };

let fonts: Promise<Font[]> | null = null;
/** Bricolage Grotesque and Inter (SIL Open Font License), bundled in data/fonts. */
function bundledFonts() {
  const load = async (file: string) => {
    const b = await readFile(join(process.cwd(), "data", "fonts", file));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };
  fonts ??= Promise.all([
    load("bricolage-grotesque-latin-800-normal.woff").then((data): Font => ({ name: "Bricolage", data, weight: 800, style: "normal" })),
    load("inter-latin-400-normal.woff").then((data): Font => ({ name: "Inter", data, weight: 400, style: "normal" })),
    load("inter-latin-600-normal.woff").then((data): Font => ({ name: "Inter", data, weight: 600, style: "normal" })),
  ]);
  return fonts;
}

/** Text outside the bundled Latin fonts (Japanese place names, say) gets Noto Sans JP, subset by Google Fonts to just those characters. */
async function fallbackFont(text: string): Promise<Font[]> {
  const extra = [...new Set(text.replace(/[\u0000-ɏ -⁯₠-⃏]/g, ""))].join("");
  if (!extra) return [];
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(extra)}`, { signal: AbortSignal.timeout(4000) }).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return [];
    const data = await fetch(url, { signal: AbortSignal.timeout(4000) }).then((r) => r.arrayBuffer());
    return [{ name: "Noto Sans JP", data, weight: 700, style: "normal" }];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const d = new URL(req.url).searchParams.get("d") ?? "";
  let data: PosterData;
  try {
    data = Poster.parse(JSON.parse(Buffer.from(d, "base64url").toString("utf8")));
  } catch {
    return new Response("Invalid poster", { status: 400 });
  }
  const [r, g, b] = data.c ?? [255, 122, 89];
  const accent = `rgb(${r},${g},${b})`;
  const qr = await QRCode.toString(data.q, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#07080d", light: "#ffffff" } });
  const qrUri = `data:image/svg+xml;base64,${Buffer.from(qr).toString("base64")}`;
  const L = LABELS[data.l ?? "en"];
  const fans = data.f ? L.fans(data.f) : undefined;
  const flyers = data.p ? L.flyers(data.p) : undefined;
  const text = [data.t, data.h, data.s, data.v, data.dt, fans, flyers, L.scan].filter(Boolean).join(" ");
  const [bundled, extra] = await Promise.all([bundledFonts(), fallbackFont(text)]);
  // A skyline of columns, like the city model's.
  const bars = Array.from({ length: 30 }, (_, i) => 40 + Math.round(Math.abs(Math.sin(i * 1.9 + r)) * 200 + (i % 4 === 0 ? 80 : 0)));
  const sans = extra.length ? "Inter, Noto Sans JP" : "Inter";
  const display = extra.length ? "Bricolage, Noto Sans JP" : "Bricolage";
  const headlineSize = data.h.length > 44 ? 88 : data.h.length > 28 ? 104 : 124;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#07080d", color: "#eef0f6", position: "relative", fontFamily: sans }}>
      <div
        style={{
          position: "absolute",
          top: -260,
          right: -260,
          width: 900,
          height: 900,
          borderRadius: 450,
          backgroundImage: `radial-gradient(circle, rgba(${r},${g},${b},0.5), rgba(${r},${g},${b},0) 70%)`,
        }}
      />
      <div style={{ position: "absolute", left: 0, right: 0, top: 690, height: 300, display: "flex", alignItems: "flex-end", gap: 8, padding: "0 56px" }}>
        {bars.map((h, i) => (
          <div key={i} style={{ flex: 1, height: h, backgroundImage: `linear-gradient(180deg, rgba(${r},${g},${b},${i % 3 === 0 ? 0.95 : 0.55}), rgba(${r},${g},${b},0.05))`, borderRadius: 4 }} />
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", padding: "76px 72px 0", gap: 26, position: "relative" }}>
        <div style={{ fontSize: 28, letterSpacing: 5, textTransform: "uppercase", color: accent, fontWeight: 600 }}>{data.t}</div>
        <div style={{ fontFamily: display, fontSize: headlineSize, lineHeight: 0.98, fontWeight: 800, letterSpacing: -3 }}>{data.h}</div>
        <div style={{ fontSize: 38, lineHeight: 1.25, color: "#c9cee0", maxWidth: 900 }}>{data.s}</div>
        {fans && <div style={{ fontSize: 30, color: accent, fontWeight: 600 }}>{fans}</div>}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 360, display: "flex", backgroundImage: "linear-gradient(180deg, rgba(7,8,13,0), #07080d 30%)" }} />
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 64, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 36 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: display, fontSize: 54, fontWeight: 800, letterSpacing: -1 }}>{data.dt}</div>
          {data.v && <div style={{ fontSize: 32, color: "#c9cee0" }}>{data.v}</div>}
          {flyers && <div style={{ fontSize: 24, color: "#a3aac0", marginTop: 10 }}>{flyers}</div>}
          {data.demo && <div style={{ fontSize: 19, color: "#727a96", marginTop: 12 }}>Demo poster from a recorded Groundswell rehearsal. The launch is fictional.</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ display: "flex", background: "#ffffff", padding: 12, borderRadius: 18 }}>
            {/* The image renderer (Satori) takes plain <img>; next/image doesn't apply here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUri} width={210} height={210} alt="" />
          </div>
          <div style={{ fontSize: 22, color: "#eef0f6", fontWeight: 600 }}>{L.scan}</div>
        </div>
      </div>
    </div>,
    { width: 1080, height: 1350, fonts: [...bundled, ...extra], headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
