"use client";

// Try a change: switch the plan's actions off and on, or add one from the
// scouted menu, and re-run the simulation 48 times right here in the browser.

import { DEFAULT_PARAMS, simulate } from "@groundswell/sim";
import { useEffect, useMemo, useState } from "react";
import type { MediaView, PartnerView, SimView, StrategyView } from "@/lib/agents/events";
import type { CityAtlas } from "@/lib/atlas/types";
import { selectionCost, toAction, type Candidate, type MenuContext, type Selection } from "@/lib/launch/actions";
import type { Zone } from "@/lib/launch/fit";
import { gridOf } from "@/lib/launch/grid";
import type { BrandOption, MediaOption, Partner } from "@/lib/launch/scout";
import { frameDaysFor, metricsOf, type PlanMetrics } from "@/lib/launch/simulate";
import { travelWeights } from "@/lib/launch/travel";
import { decodeBytes } from "./use-run";

export interface WhatIfResult {
  metrics: PlanMetrics;
  frames: Uint8Array[];
  frameDays: number[];
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** A sensible default timing for an action added from the menu. */
function defaultSelection(c: Candidate, days: number): Selection {
  if (c.kind === "street") return { id: c.id, day: Math.max(0, days - 14) };
  if (c.kind === "popup") return { id: c.id, day: Math.max(0, days - 10) };
  if (c.kind === "podcast") return { id: c.id, day: Math.max(0, days - 21) };
  if (c.kind === "social") return { id: c.id, start: Math.max(0, days - 21), days: 21 };
  if (c.kind === "collab") return { id: c.id, start: Math.max(0, days - 21), days: 14 };
  return { id: c.id };
}

export function WhatIf({
  atlas,
  fit,
  venue,
  zones,
  partners,
  media,
  brandHeat,
  candidates,
  strategy,
  plan,
  baseline,
  days,
  budget,
  onResult,
}: {
  atlas: CityAtlas;
  fit: number[];
  venue?: { lon: number; lat: number } | null;
  zones: Zone[];
  partners: PartnerView[];
  media: MediaView[];
  brandHeat?: Record<string, string>;
  candidates: Candidate[];
  strategy: StrategyView;
  plan: SimView;
  baseline?: SimView;
  days: number;
  budget: number;
  onResult: (r: WhatIfResult | null) => void;
}) {
  const [selections, setSelections] = useState<Selection[]>(strategy.selections);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState("");
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [ms, setMs] = useState<number | null>(null);

  const ctx = useMemo<MenuContext>(() => {
    const brands: BrandOption[] = media
      .filter((m) => m.kind === "brand")
      .map((m) => ({ id: m.id, name: m.name, type: "brand", tags: [], affinity: m.affinity, popularity: m.popularity, drivers: [], kind: "brand", heat: brandHeat?.[m.id] ? Array.from(decodeBytes(brandHeat[m.id]), (b) => b / 255) : [] }));
    const podcasts: MediaOption[] = media
      .filter((m) => m.kind === "podcast")
      .map((m) => ({ id: m.id, name: m.name, type: "podcast", tags: [], affinity: m.affinity, popularity: m.popularity, drivers: [], kind: "podcast" }));
    const ps: Partner[] = partners.map((p) => ({ id: p.id, name: p.name, affinity: p.affinity, lat: p.lat, lon: p.lon, categories: [p.category], tags: [], drivers: [], zone: p.zone, cell: p.cell }));
    return { atlas, fit, zones, partners: ps, podcasts, brands, days, names: new Map() };
  }, [atlas, fit, zones, partners, media, brandHeat, days]);
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const travel = useMemo(() => (venue ? travelWeights(atlas, venue) : undefined), [atlas, venue]);
  const active = selections.filter((_, i) => !off.has(i));
  const cost = active.reduce((s, x) => (byId.get(x.id) ? s + selectionCost(byId.get(x.id)!, x, days) : s), 0);
  const changed = off.size > 0 || selections.length !== strategy.selections.length;
  const usable = partners.every((p) => typeof p.cell === "number");

  useEffect(() => {
    if (!changed || !usable) {
      setResult(null);
      onResult(null);
      return;
    }
    const t = setTimeout(() => {
      const started = performance.now();
      const actions = active.flatMap((s) => toAction(s, ctx, byId) ?? []);
      const frameDays = frameDaysFor(days);
      const res = simulate(gridOf(atlas, fit, travel), actions, { ...DEFAULT_PARAMS, days, runs: 48, seed: 1, frameDays });
      const frames = res.frames.map((f) => Uint8Array.from(f.cells, (x, i) => (res.audienceByCell[i] > 0 ? Math.min(255, Math.round((x / res.audienceByCell[i]) * 255)) : 0)));
      const r = { metrics: metricsOf(res, atlas, actions), frames, frameDays };
      setMs(Math.round(performance.now() - started));
      setResult(r);
      onResult(r);
    }, 120);
    return () => clearTimeout(t);
    // Re-run whenever the edited plan changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections, off, ctx, travel]);

  if (!usable) return null;
  const inPlan = new Set(selections.map((s) => s.id));
  const addable = candidates.filter((c) => !inPlan.has(c.id));
  const m = result?.metrics;
  const delta = m ? m.reach.mean - plan.metrics.reach.mean : 0;

  return (
    <section className="rounded-2xl border border-cool/30 bg-cool/5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cool">Try a change</h3>
        <span className="text-[11px] text-dim">Re-runs the simulation 48 times in your browser{ms !== null ? ` (${ms} ms)` : ""}</span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {selections.map((s, i) => {
          const c = byId.get(s.id);
          if (!c) return null;
          const on = !off.has(i);
          return (
            <li key={`${s.id}-${i}`}>
              <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setOff((o) => {
                      const n = new Set(o);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
                  className="mt-0.5 size-4 accent-[#4fd1c5]"
                />
                <span className={on ? "text-text" : "text-dim line-through"}>
                  {c.label} <span className="text-dim">· ${selectionCost(c, s, days).toLocaleString()}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {addable.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="whatif-add" className="sr-only">
            Add an action
          </label>
          <select id="whatif-add" value={adding} onChange={(e) => setAdding(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-[12.5px]">
            <option value="">Add an action from the scouts&apos; menu…</option>
            {addable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} (${c.cost.toLocaleString()}
                {c.kind === "social" ? "/day" : c.kind === "street" ? "/day" : ""})
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!adding}
            onClick={() => {
              const c = byId.get(adding);
              if (c) setSelections((s) => [...s, defaultSelection(c, days)]);
              setAdding("");
            }}
            className="rounded-full border border-cool/50 px-3 py-1.5 text-[12.5px] text-cool disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Edited plan" value={m ? pct(m.reach.mean) : pct(plan.metrics.reach.mean)} note={m ? `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)} pts` : "unchanged"} tone={m ? (delta >= 0 ? "good" : "bad") : undefined} />
        <Stat label="Cost" value={`$${cost.toLocaleString()}`} note={cost > budget ? "over budget" : `of $${budget.toLocaleString()}`} tone={cost > budget ? "bad" : undefined} />
        <Stat label="Benchmark" value={baseline ? pct(baseline.metrics.reach.mean) : "—"} note="no taste data" />
      </div>
      {changed && (
        <button
          type="button"
          onClick={() => {
            setSelections(strategy.selections);
            setOff(new Set());
          }}
          className="mt-2 text-[12px] text-dim underline-offset-2 hover:text-text hover:underline"
        >
          Reset to the team&apos;s plan
        </button>
      )}
    </section>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-line bg-panel-2 p-2">
      <div className="text-[10.5px] text-muted">{label}</div>
      <div className="font-display text-lg font-semibold">{value}</div>
      <div className={`text-[10.5px] ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-dim"}`}>{note}</div>
    </div>
  );
}
