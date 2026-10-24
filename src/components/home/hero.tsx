"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { CITIES } from "@/lib/atlas/cities";
import type { CityAtlas } from "@/lib/atlas/types";
import { Composer } from "./composer";

const CityMap = dynamic(() => import("../city-map"), { ssr: false, loading: () => <div className="absolute inset-0 bg-ink" /> });

export function Hero() {
  const [cityId, setCityId] = useState("chicago");
  const [atlas, setAtlas] = useState<CityAtlas | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [initialBrief, setInitialBrief] = useState("");

  // "Rehearse it in <city>" links arrive with ?city= and ?brief=.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = q.get("city");
    if (c && CITIES.some((x) => x.id === c)) setCityId(c);
    const b = q.get("brief");
    if (b) setInitialBrief(b.slice(0, 1500));
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/atlas/${cityId}`)
      .then((r) => r.json())
      .then((a: CityAtlas) => alive && setAtlas(a))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [cityId]);

  return (
    <section className="relative min-h-[100svh] overflow-hidden">
      <div className="absolute inset-0">
        {atlas && <CityMap atlas={atlas} mode="districts" autoRotate highlightDistrict={hover} shift={[-0.09, 0.01]} className="absolute inset-0" />}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink via-ink/70 to-transparent lg:via-ink/40" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-[1600px] flex-col justify-center gap-8 px-4 pt-20 pb-10 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-xl space-y-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-glow">A flight simulator for culture</p>
          <h1 className="font-display text-[2.6rem] leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl">
            Rehearse your launch in a <span className="text-gradient">living model</span> of the city.
          </h1>
          <p className="max-w-lg text-[16px] leading-relaxed text-muted">
            Groundswell builds a street-level model of a real city from Qloo&apos;s taste graph. A team of AI agents rehearses your launch inside it hundreds of times, hands you the plan
            that worked with real places, podcasts and partners, then writes the launch kit and steers the campaign from its scans.
          </p>
          <Composer cityId={cityId} onCity={setCityId} initialBrief={initialBrief} />
        </div>

        <div className="glass w-full max-w-sm space-y-3 rounded-2xl border border-line p-4 lg:mb-2">
          <div className="flex flex-wrap gap-1.5">
            {CITIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCityId(c.id)}
                className={`rounded-full px-2.5 py-1 text-[12px] transition-colors ${cityId === c.id ? "bg-text text-ink" : "border border-line text-muted hover:text-text"}`}
                aria-pressed={cityId === c.id}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">Taste districts of {atlas?.city.name ?? "…"}</div>
            <ul className="space-y-1">
              {atlas?.districts.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setHover(d.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(d.id)}
                    onBlur={() => setHover(null)}
                    className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-panel-3"
                  >
                    <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: `rgb(${d.color.join(",")})` }} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{d.name}</span>
                      <span className="block truncate text-[11.5px] text-dim">{d.places.slice(0, 3).join(" · ")}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] leading-snug text-dim">
            {atlas ? `${atlas.cells.length.toLocaleString()} neighbourhood cells, each with a taste fingerprint from ${atlas.probes.length} Qloo heatmaps. Names written by Claude from the data.` : "Loading the city…"}
          </p>
        </div>
      </div>
    </section>
  );
}
