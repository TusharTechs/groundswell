"use client";

// The deliverable: the winning plan, week by week and place by place, with the
// simulated outcome against the benchmark, the street voices, and exports.

import Link from "next/link";
import type { PlanView, SimView, StrategyView, Voice } from "@/lib/agents/events";
import type { LaunchSpec } from "@/lib/launch/spec";
import type { Evidence } from "@/lib/qloo/entities";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csv = (rows: (string | number | undefined)[][]) => rows.map((r) => r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");

export function PlanSheet({
  plan,
  sim,
  baseline,
  strategy,
  spec,
  voices,
  qloo,
  cityName,
  onClose,
  children,
}: {
  plan: PlanView;
  sim: SimView;
  baseline?: SimView;
  strategy?: StrategyView;
  spec?: LaunchSpec;
  voices?: Voice[];
  qloo: Evidence[];
  cityName: string;
  onClose?: () => void;
  /** Slot after the headline numbers, for the what-if panel. */
  children?: React.ReactNode;
}) {
  const m = sim.metrics;
  const b = baseline?.metrics;
  const lift = b ? m.reach.mean / Math.max(1e-6, b.reach.mean) : null;
  const maxDistrict = Math.max(0.01, ...m.byDistrict.map((d) => d.reach), ...(b?.byDistrict.map((d) => d.reach) ?? []));
  const slug = (spec?.title ?? "launch").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <article className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-glow">The plan · {cityName}</p>
          <h2 className="mt-1 font-display text-2xl leading-tight font-semibold text-balance sm:text-3xl">{plan.headline}</h2>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="shrink-0 rounded-full border border-line px-3 py-1 text-[12px] text-muted hover:text-text" aria-label="Back to the map">
            Map
          </button>
        )}
      </header>
      <p className="text-[15px] leading-relaxed text-muted">{plan.summary}</p>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Kpi label="Natural audience reached" value={pct(m.reach.mean)} note={`${pct(m.reach.p10)}–${pct(m.reach.p90)} in 9 of 10 runs`} accent />
        <Kpi label="vs. same budget, no taste data" value={lift ? `${lift.toFixed(1)}×` : "—"} note={b ? `benchmark ${pct(b.reach.mean)}` : ""} />
        <Kpi label="Cost per point of reach" value={m.costPerPoint ? `$${m.costPerPoint.toLocaleString()}` : "—"} note={`$${m.cost.toLocaleString()} of $${(spec?.budget ?? m.cost).toLocaleString()} spent`} />
        <Kpi label="From word of mouth" value={pct(m.wordOfMouthShare)} note={`${m.cellsReached} neighbourhood cells lit`} />
      </div>

      {children}

      <section>
        <H>Reach by taste district</H>
        <ul className="space-y-1.5">
          {m.byDistrict.map((d) => {
            const bd = b?.byDistrict.find((x) => x.district === d.district);
            return (
              <li key={d.district} className="grid grid-cols-[minmax(0,11rem)_1fr_3.5rem] items-center gap-2 text-[12px]">
                <span className="truncate text-muted" title={d.name}>
                  {d.name}
                </span>
                <div className="space-y-0.5">
                  <div className="h-2 rounded-full bg-gradient-to-r from-glow to-hot" style={{ width: `${(d.reach / maxDistrict) * 100}%` }} />
                  {bd && <div className="h-1 rounded-full bg-[#5b6280]" style={{ width: `${(bd.reach / maxDistrict) * 100}%` }} />}
                </div>
                <span className="text-right font-mono">{pct(d.reach)}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-1.5 text-[11px] text-dim">Thick bar: this plan. Thin bar: the benchmark.</p>
      </section>

      <section>
        <H>Week by week</H>
        <ol className="space-y-3">
          {plan.weeks.map((w) => (
            <li key={w.label} className="rounded-xl border border-line bg-panel-2 p-3">
              <div className="mb-1.5 text-[12px] font-semibold text-text">{w.label}</div>
              <ul className="list-disc space-y-1 pl-4 text-[13px] text-muted marker:text-dim">
                {w.items.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      {plan.partners.length > 0 && (
        <section>
          <H>Partner places (from Qloo)</H>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {plan.partners.map((p) => (
              <li key={p.name} className="p-3 text-[13px]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{p.name}</span>
                  {p.address && (
                    <a className="text-[12px] text-cool underline-offset-2 hover:underline" href={`https://www.google.com/maps/search/${encodeURIComponent(`${p.name} ${p.address}`)}`} target="_blank" rel="noreferrer">
                      {p.address}
                    </a>
                  )}
                </div>
                <div className="mt-0.5 text-text/90">{p.action}</div>
                <div className="mt-0.5 text-[12px] text-dim">{p.why}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.media.length > 0 && (
        <section>
          <H>Media and brand partners (from Qloo)</H>
          <ul className="space-y-2 text-[13px]">
            {plan.media.map((p) => (
              <li key={p.name}>
                <span className="font-semibold">{p.name}.</span> <span className="text-text/90">{p.action}</span> <span className="text-dim">{p.why}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {voices && voices.length > 0 && (
        <section>
          <H>Street voices (simulated residents)</H>
          <ul className="grid gap-2 sm:grid-cols-2">
            {voices.map((v) => (
              <li key={v.name + v.where} className="rounded-xl border border-line bg-panel-2 p-3 text-[13px]">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {v.name}, {v.where}
                  </span>
                  <span className={`rounded-full px-2 text-[10px] font-semibold uppercase tracking-wider ${v.stance === "in" ? "bg-good/15 text-good" : v.stance === "maybe" ? "bg-warn/15 text-warn" : "bg-panel-3 text-dim"}`}>{v.stance}</span>
                </div>
                <p className="text-text/90">“{v.quote}”</p>
                <p className="mt-1 text-[11.5px] text-dim">Would change their mind: {v.change}</p>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-dim">Written by Claude from each area&apos;s Qloo taste signature and the real places nearby. Not real people.</p>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <H>Watch out for</H>
          <ul className="list-disc space-y-1 pl-4 text-[13px] text-muted marker:text-dim">
            {plan.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
        <div>
          <H>Measure each week</H>
          <ul className="list-disc space-y-1 pl-4 text-[13px] text-muted marker:text-dim">
            {plan.measure.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-panel-2 p-3 text-[12px] text-muted">
        Projections come from a simulation, not a forecast: a model of the city built from Qloo taste data ({qloo.length} Qloo requests in this run), with word of mouth between
        neighbouring and taste-similar areas. Assumptions and method are on{" "}
        <Link href="/method" className="text-cool underline-offset-2 hover:underline">
          How it works
        </Link>
        .
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full bg-text px-4 py-2 text-[13px] font-semibold text-ink hover:bg-glow"
          onClick={() =>
            download(
              `${slug}-partners.csv`,
              csv([["name", "address", "action", "why", "website"], ...plan.partners.map((p) => [p.name, p.address, p.action, p.why, p.website])]),
              "text/csv",
            )
          }
        >
          Partners (CSV)
        </button>
        <button
          type="button"
          className="rounded-full border border-line px-4 py-2 text-[13px] hover:border-text"
          onClick={() => download(`${slug}-plan.json`, JSON.stringify({ spec, strategy, plan, metrics: m, benchmark: b }, null, 2), "application/json")}
        >
          Full plan (JSON)
        </button>
        <button
          type="button"
          className="rounded-full border border-line px-4 py-2 text-[13px] hover:border-text"
          onClick={() =>
            navigator.clipboard?.writeText(
              [plan.headline, "", plan.summary, "", ...plan.weeks.flatMap((w) => [w.label, ...w.items.map((i) => `- ${i}`), ""])].join("\n"),
            )
          }
        >
          Copy summary
        </button>
      </div>
    </article>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">{children}</h3>;
}

function Kpi({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? "border-glow/40 bg-glow/5" : "border-line bg-panel-2"}`}>
      <div className="text-[11px] leading-tight text-muted">{label}</div>
      <div className={`mt-1 font-display text-2xl font-semibold ${accent ? "text-gradient" : ""}`}>{value}</div>
      {note && <div className="mt-0.5 text-[11px] text-dim">{note}</div>}
    </div>
  );
}
