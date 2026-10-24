"use client";

// The Strategist's search: every variation it tested in the simulator (small
// dots, by round), the plans it submitted (labelled), the one the team chose,
// the benchmark, and the best in-budget reach found at each cost (the frontier),
// on cost against reach.

import type { SimView, StrategyView } from "@/lib/agents/events";

type Probe = { round: number; cost: number; reach: number; actions: number; overBudget: boolean };

const ROUND_COLOR = ["#c98a52", "#ff8fb0", "#9d8bff", "#4fd1c5"];
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const money = (c: number) => (c >= 1000 ? `$${(c / 1000).toFixed(c % 1000 === 0 ? 0 : 1)}k` : `$${Math.round(c)}`);

/** Round numbers to label an axis between lo and hi. */
function niceTicks(lo: number, hi: number, n = 4) {
  const step0 = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
  return out;
}

export function SearchSpace({ probes, strategies, sims, baseline, budget, winner }: { probes: Probe[]; strategies: StrategyView[]; sims: Record<string, SimView>; baseline?: SimView; budget: number; winner?: string }) {
  const W = 600;
  const H = 220;
  const pad = { l: 44, r: 16, t: 14, b: 30 };
  const plans = strategies.filter((s) => sims[s.id]).map((s) => ({ id: s.id, name: s.name, cost: s.cost, reach: sims[s.id].metrics.reach.mean, round: s.round }));
  if (!probes.length && !plans.length) return <p className="px-2 py-6 text-center text-[12px] text-dim">The Strategist&apos;s tests will appear here.</p>;

  // Zoom the cost axis onto where the plans are, not onto $0.
  const costs = [...probes.map((p) => p.cost), ...plans.map((p) => p.cost), baseline?.metrics.cost ?? budget, budget];
  const minCost = Math.max(0, Math.min(...costs) * 0.92);
  const maxCost = Math.max(...costs) * 1.04;
  const maxReach = Math.max(0.05, ...probes.map((p) => p.reach), ...plans.map((p) => p.reach), baseline?.metrics.reach.mean ?? 0) * 1.15;
  const x = (c: number) => pad.l + ((c - minCost) / Math.max(1, maxCost - minCost)) * (W - pad.l - pad.r);
  const y = (r: number) => H - pad.b - (r / maxReach) * (H - pad.t - pad.b);
  const yTicks = niceTicks(0, maxReach, 4).filter((t) => t <= maxReach);
  const xTicks = niceTicks(minCost, maxCost, 4).filter((t) => t >= minCost && t <= maxCost && Math.abs(x(t) - x(budget)) > 28);

  // The frontier: the best in-budget reach found at or below each cost.
  const points = [...probes.filter((p) => !p.overBudget), ...plans.filter((p) => p.cost <= budget * 1.001)].sort((a, b) => a.cost - b.cost);
  const frontier: { cost: number; reach: number }[] = [];
  for (const p of points) if (!frontier.length || p.reach > frontier[frontier.length - 1].reach) frontier.push(p);

  // Labels: nudge apart plans whose labels would overlap.
  const placed: { id: string; lx: number; ly: number }[] = [];
  for (const p of [...plans].sort((a, b) => b.reach - a.reach)) {
    let ly = y(p.reach) + 3;
    const lx = x(p.cost) + 11;
    while (placed.some((q) => Math.abs(q.lx - lx) < 60 && Math.abs(q.ly - ly) < 11)) ly += 11;
    placed.push({ id: p.id, lx, ly });
  }

  return (
    <figure className="px-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${probes.length} variations tested in the simulator, ${plans.length} plans submitted`}>
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#252a3b" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="#828aa6">
              {pct(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={x(t)} y={H - pad.b + 14} textAnchor="middle" fontSize={9} fill="#828aa6">
            {money(t)}
          </text>
        ))}
        <text x={W - pad.r} y={H - 4} textAnchor="end" fontSize={9} fill="#828aa6">
          cost of the plan →
        </text>
        <text x={pad.l} y={pad.t - 4} fontSize={9} fill="#828aa6">
          reach of the natural audience
        </text>
        <rect x={x(budget)} y={pad.t} width={Math.max(0, W - pad.r - x(budget))} height={H - pad.t - pad.b} fill="#ff6b6b" opacity={0.05} />
        <line x1={x(budget)} x2={x(budget)} y1={pad.t} y2={H - pad.b} stroke="#ffcc66" strokeDasharray="4 4" strokeWidth={1} opacity={0.75} />
        <text x={x(budget)} y={H - pad.b + 14} textAnchor="middle" fontSize={9} fontWeight={700} fill="#ffcc66">
          budget {money(budget)}
        </text>
        {frontier.length > 1 && (
          <polyline points={frontier.map((p) => `${x(p.cost)},${y(p.reach)}`).join(" ")} fill="none" stroke="#ffb547" strokeWidth={1.5} strokeOpacity={0.55} strokeLinejoin="round" />
        )}
        {probes.map((p, i) => (
          <circle key={i} cx={x(p.cost)} cy={y(p.reach)} r={3} fill={ROUND_COLOR[(p.round - 1) % ROUND_COLOR.length]} opacity={p.overBudget ? 0.22 : 0.6} />
        ))}
        {baseline && (
          <g>
            <rect
              x={x(baseline.metrics.cost) - 5}
              y={y(baseline.metrics.reach.mean) - 5}
              width={10}
              height={10}
              transform={`rotate(45 ${x(baseline.metrics.cost)} ${y(baseline.metrics.reach.mean)})`}
              fill="#5b6280"
              stroke="#a3aac0"
              strokeWidth={1}
            />
            <text x={x(baseline.metrics.cost) - 10} y={y(baseline.metrics.reach.mean) + 3} textAnchor="end" fontSize={9.5} fill="#a3aac0">
              benchmark {pct(baseline.metrics.reach.mean)}
            </text>
          </g>
        )}
        {plans.map((p) => (
          <circle
            key={p.id}
            cx={x(p.cost)}
            cy={y(p.reach)}
            r={p.id === winner ? 8 : 6}
            fill={ROUND_COLOR[(p.round - 1) % ROUND_COLOR.length]}
            stroke={p.id === winner ? "#ffb547" : "#07080d"}
            strokeWidth={p.id === winner ? 3 : 1.5}
          />
        ))}
        {placed.map((l) => {
          const p = plans.find((q) => q.id === l.id)!;
          return (
            <text key={l.id} x={l.lx} y={l.ly} fontSize={10} fontWeight={700} fill={l.id === winner ? "#ffb547" : "#eef0f6"}>
              {l.id} {(p.reach * 100).toFixed(1)}%
              {l.id === winner ? " · chosen" : ""}
            </text>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-dim">
        <span>
          {probes.length} variation{probes.length === 1 ? "" : "s"} tested in the simulator · {plans.length} submitted
        </span>
        {[...new Set([...probes.map((p) => p.round), ...plans.map((p) => p.round)])].sort().map((r) => (
          <span key={r} className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ background: ROUND_COLOR[(r - 1) % ROUND_COLOR.length] }} /> round {r}
          </span>
        ))}
        {frontier.length > 1 && (
          <span className="inline-flex items-center gap-1">
            <span className="h-0.5 w-3 rounded bg-glow/60" /> best reach found at each cost
          </span>
        )}
      </figcaption>
    </figure>
  );
}
