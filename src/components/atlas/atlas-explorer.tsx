"use client";

// The Taste Atlas: every city as neighbourhood cells with a Qloo taste
// fingerprint, grouped into taste districts, with each district's closest
// taste twin in the other cities.

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { CITIES } from "@/lib/atlas/cities";
import type { CityAtlas } from "@/lib/atlas/types";
import { decodeBytes } from "../rehearsal/use-run";

const CityMap = dynamic(() => import("../city-map"), { ssr: false, loading: () => <div className="absolute inset-0 animate-pulse bg-panel" /> });

type Twin = { from: { city: string; district: number }; to: { city: string; district: number; similarity: number }[] };

export function AtlasExplorer() {
  const [cityId, setCityId] = useState("chicago");
  const [atlas, setAtlas] = useState<CityAtlas | null>(null);
  const [twins, setTwins] = useState<Twin[]>([]);
  const [district, setDistrict] = useState<number | null>(null);
  const [cell, setCell] = useState<number | null>(null);
  const [names, setNames] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetch("/api/twins")
      .then((r) => r.json())
      .then(setTwins)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    let alive = true;
    setAtlas(null);
    setCell(null);
    fetch(`/api/atlas/${cityId}`)
      .then((r) => r.json())
      .then((a: CityAtlas) => {
        if (!alive) return;
        setAtlas(a);
        setNames((n) => ({ ...n, [a.city.id]: a.districts.map((d) => d.name) }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [cityId]);
  // District names for every city, so twins can be named without loading each atlas's grid first.
  useEffect(() => {
    CITIES.forEach((c) => {
      if (names[c.id]) return;
      fetch(`/api/atlas/${c.id}`)
        .then((r) => r.json())
        .then((a: CityAtlas) => setNames((n) => ({ ...n, [c.id]: a.districts.map((d) => d.name) })))
        .catch(() => undefined);
    });
    // Once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matrix = useMemo(() => (atlas ? decodeBytes(atlas.vectors) : null), [atlas]);
  // Mean value and coverage per probe. Sparse probes (Qloo data in under 45% of cells) appear only where
  // data is dense, so their multipliers would measure activity, not taste: they are left out, as in districts.
  const stats = useMemo(() => {
    if (!atlas || !matrix) return [];
    const n = atlas.cells.length;
    const m = atlas.probes.length;
    return atlas.probes.map((_, p) => {
      let s = 0;
      let c = 0;
      for (let i = 0; i < n; i++) {
        s += matrix[i * m + p];
        if (matrix[i * m + p] > 0) c++;
      }
      return { mean: s / n, coverage: c / n };
    });
  }, [atlas, matrix]);

  const fingerprint = useMemo(() => {
    if (!atlas || !matrix || cell === null) return null;
    const m = atlas.probes.length;
    const rows = atlas.probes
      .map((p, k) => ({ label: p.label, value: matrix[cell * m + k] / 255, lift: stats[k]?.mean ? matrix[cell * m + k] / stats[k].mean : 0, ok: (stats[k]?.coverage ?? 0) >= 0.45 }))
      .filter((r) => r.value > 0);
    const present = rows.length;
    const top = rows.filter((r) => r.ok).sort((a, b) => b.lift - a.lift);
    return { top: top.slice(0, 7), present };
  }, [atlas, matrix, stats, cell]);

  const focusDistrict = cell !== null && atlas ? atlas.cells[cell].district : district;
  const twinRow = twins.find((t) => t.from.city === cityId && t.from.district === focusDistrict);

  return (
    <div className="relative min-h-dvh lg:h-dvh lg:overflow-hidden">
      <div className="relative h-[60vh] lg:absolute lg:inset-0 lg:h-auto">
        {atlas && (
          <CityMap
            atlas={atlas}
            mode="districts"
            highlightDistrict={focusDistrict}
            onCellClick={(i) => {
              setCell(i);
              setDistrict(atlas.cells[i].district);
            }}
            className="absolute inset-0"
          />
        )}
      </div>

      <aside className="relative z-10 space-y-3 p-3 lg:absolute lg:top-[4.5rem] lg:left-4 lg:max-h-[calc(100dvh-6rem)] lg:w-[380px] lg:overflow-y-auto lg:p-0 scroll-thin">
        <div className="glass rounded-2xl border border-line p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-glow">Taste Atlas</p>
          <h1 className="mt-1 font-display text-2xl leading-tight font-semibold">Every city, mapped by what it loves</h1>
          <p className="mt-1.5 text-[13px] leading-snug text-muted">
            Each block is a neighbourhood cell, about a kilometre across, with a fingerprint from {atlas?.probes.length ?? 54} Qloo heatmaps. Colours are taste districts; click any cell.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {CITIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCityId(c.id);
                  setDistrict(null);
                }}
                className={`rounded-full px-2.5 py-1 text-[12px] ${cityId === c.id ? "bg-text text-ink" : "border border-line text-muted hover:text-text"}`}
                aria-pressed={cityId === c.id}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl border border-line p-3">
          <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">Taste districts of {atlas?.city.name ?? "…"}</h2>
          <ul className="space-y-1">
            {atlas?.districts.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => {
                    setDistrict(district === d.id ? null : d.id);
                    setCell(null);
                  }}
                  className={`w-full rounded-xl p-2 text-left transition-colors ${focusDistrict === d.id ? "bg-panel-3" : "hover:bg-panel-2"}`}
                  aria-pressed={focusDistrict === d.id}
                >
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: `rgb(${d.color.join(",")})` }} />
                    <span className="text-[13.5px] font-semibold">{d.name}</span>
                    <span className="ml-auto text-[11px] text-dim">{Math.round(d.activityShare * 100)}%</span>
                  </div>
                  {focusDistrict === d.id && (
                    <div className="mt-1.5 space-y-1.5 pl-4.5 text-[12px]">
                      <p className="text-muted">{d.blurb}</p>
                      <div className="flex flex-wrap gap-1">
                        {d.signature.slice(0, 5).map((s) => (
                          <span key={s.probe} className="rounded-full border border-line px-2 py-0.5 text-text/90">
                            {atlas.probes[s.probe].label} <span className="text-dim">{s.lift.toFixed(1)}×</span>
                          </span>
                        ))}
                      </div>
                      <p className="text-dim">{d.places.slice(0, 5).join(" · ")}</p>
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-[11px] text-dim">District names are written by Claude from each district&apos;s Qloo signature. Multipliers compare the district with the city average.</p>
        </div>
      </aside>

      <aside className="relative z-10 space-y-3 p-3 lg:absolute lg:top-[4.5rem] lg:right-4 lg:w-[360px] lg:p-0">
        {fingerprint && atlas && cell !== null && (
          <div className="glass rounded-2xl border border-line p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">This neighbourhood</p>
            <h2 className="mt-0.5 font-display text-xl font-semibold">{atlas.cells[cell].locality ?? "Unnamed area"}</h2>
            <p className="text-[12px] text-muted">{atlas.districts[atlas.cells[cell].district]?.name}</p>
            <ul className="mt-3 space-y-1.5">
              {fingerprint.top.map((r) => (
                <li key={r.label} className="grid grid-cols-[7.5rem_1fr_2.8rem] items-center gap-2 text-[12px]">
                  <span className="truncate">{r.label}</span>
                  <div className="h-1.5 rounded-full bg-panel-3">
                    <div className="h-full rounded-full bg-gradient-to-r from-cool to-accent" style={{ width: `${Math.min(100, (r.lift / 4) * 100)}%` }} />
                  </div>
                  <span className="text-right font-mono text-[11px]">{r.lift.toFixed(1)}×</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-dim">Leans most toward, against the city average. Qloo had data for {fingerprint.present} of {atlas.probes.length} probes here.</p>
          </div>
        )}
        {twinRow && atlas && focusDistrict !== null && (
          <div className="glass rounded-2xl border border-line p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cool">Taste twins</p>
            <h2 className="mt-0.5 font-display text-lg leading-snug font-semibold">Where else in the world is “{atlas.districts[focusDistrict]?.name}”?</h2>
            <ul className="mt-2 space-y-1">
              {twinRow.to.map((t) => {
                const city = CITIES.find((c) => c.id === t.city)!;
                return (
                  <li key={t.city}>
                    <button
                      type="button"
                      onClick={() => {
                        setCityId(t.city);
                        setDistrict(t.district);
                      }}
                      className="grid w-full grid-cols-[1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-panel-3"
                    >
                      <span className="min-w-0">
                        <span className="font-semibold">{city.name}</span>
                        <span className="block truncate text-[12px] text-muted">{names[t.city]?.[t.district] ?? `District ${t.district + 1}`}</span>
                      </span>
                      <span className="font-mono text-[12px] text-cool">{Math.round(Math.max(0, t.similarity) * 100)}%</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[11px] text-dim">Similarity of the districts&apos; taste profiles across the same probes, measured against each city&apos;s own average.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
