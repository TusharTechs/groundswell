import { ImageResponse } from "next/og";

export const alt = "Groundswell: rehearse your launch in a living model of the city";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// A stylised city of glowing columns behind the title.
export default function OpenGraphImage() {
  const cols = Array.from({ length: 34 }, (_, i) => {
    const x = (i * 0.37) % 1;
    const h = 60 + Math.round(Math.abs(Math.sin(i * 1.7)) * 260 + (i % 5 === 0 ? 120 : 0));
    const hot = i % 3 === 0;
    return { left: 560 + i * 18 + Math.round(x * 6), h, color: hot ? "#ff5c8a" : i % 3 === 1 ? "#ffb547" : "#4fd1c5" };
  });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#07080d", position: "relative", fontFamily: "sans-serif" }}>
        {cols.map((c, i) => (
          <div key={i} style={{ position: "absolute", left: c.left, bottom: 0, width: 10, height: c.h, background: c.color, opacity: 0.85, borderRadius: 3 }} />
        ))}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, #07080d 45%, rgba(7,8,13,0.2))" }} />
        <div style={{ display: "flex", flexDirection: "column", padding: 72, gap: 20, position: "relative" }}>
          <div style={{ fontSize: 26, color: "#ffb547", letterSpacing: 4, textTransform: "uppercase" }}>A flight simulator for culture</div>
          <div style={{ fontSize: 76, color: "#eef0f6", fontWeight: 700, lineHeight: 1.02, maxWidth: 640 }}>Rehearse your launch in a living model of the city.</div>
          <div style={{ fontSize: 28, color: "#a3aac0", maxWidth: 600 }}>Nine AI agents. Seven cities built from Qloo&apos;s taste graph. The plan that worked.</div>
          <div style={{ fontSize: 30, color: "#eef0f6", fontWeight: 700, marginTop: 12 }}>groundswell</div>
        </div>
      </div>
    ),
    size,
  );
}
