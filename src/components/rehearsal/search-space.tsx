"use client";

// The Strategist's search: every variation it tested in the simulator (small
// dots, by round), the plans it submitted (labelled), the one the team chose,
// and the benchmark, on cost against reach.

import type { SimView, StrategyView } from "@/lib/agents/events";

type Probe = { round: number; cost: number; reach: number; actions: number; overBudget: boolean };

const ROUND_COLOR = ["#c98a52", "#ff8fb0", "#9d8bff", "#4fd1c5"];
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

export function SearchSpace({ probes, strategies, sims, baseline, budget, winner }: { probes: Probe[]; strategies: StrategyView[]; sims: Record<string, SimView>; baseline?: SimView; budget: number; winner?: string }) {
  const W = 600;
  const H = 210;
  const pad = { l: 40, r: 12, t: 12, b: 28 };
  const plans = strategies.filter((s) => sims[s.id]).map((s) => ({ id: s.id, name: s.name, cost: s.cost, reach: sims[s.id].metrics.reach.mean, round: s.round }));
  const maxCost = Math.max(budget * 1.08, ...probes.map((p) => p.cost), ...plans.map((p) => p.cost), 1);
  const maxReach = Math.max(0.05, ...probes.map((p) => p.reach), ...plans.map((p) => p.reach), baseline?.metrics.reach.mean ?? 0) * 1.12;
  const x = (c: number) => pad.l + (c / maxCost) * (W - pad.l - pad.r);
  const y = (r: number) => H - pad.b - (r / maxReach) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxReach);
  if (!probes.length && !plans.length) return <p className="px-2 py-6 text-center text-[12px] text-dim">The Strategist&apos;s tests will appear here.</p>;
  return (
    <figure className="px-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${probes.length} variations tested in the simulator, ${plans.length} plans submitted`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#252a3b" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="#727a96">
              {pct(t)}
            </text>
          </g>
        ))}
        <line x1={x(budget)} x2={x(budget)} y1={pad.t} y2={H - pad.b} stroke="#ffcc66" strokeDasharray="4 4" strokeWidth={1} opacity={0.7} />
        <text x={x(budget) - 4} y={pad.t + 9} textAnchor="end" fontSize={9} fill="#ffcc66">
          budget ${budget.toLocaleString()}
        </text>
        <text x={W - pad.r} y={H - 8} textAnchor="end" fontSize={9} fill="#727a96">
          cost →
        </text>
        <text x={pad.l} y={H - 8} fontSize={9} fill="#727a96">
          $0
        </text>
        {probes.map((p, i) => (
          <circle key={i} cx={x(p.cost)} cy={y(p.reach)} r={3} fill={ROUND_COLOR[(p.round - 1) % ROUND_COLOR.length]} opacity={p.overBudget ? 0.25 : 0.55} />
        ))}
        {baseline && (
          <g>
            <rect x={x(baseline.metrics.cost) - 5} y={y(baseline.metrics.reach.mean) - 5} width={10} height={10} transform={`rotate(45 ${x(baseline.metrics.cost)} ${y(baseline.metrics.reach.mean)})`} fill="#5b6280" />
            <text x={x(baseline.metrics.cost) - 9} y={y(baseline.metrics.reach.mean) + 3} textAnchor="end" fontSize={9} fill="#a3aac0">
              benchmark
            </text>
          </g>
        )}
        {plans.map((p) => (
          <g key={p.id}>
            <circle cx={x(p.cost)} cy={y(p.reach)} r={p.id === winner ? 8 : 6} fill={ROUND_COLOR[(p.round - 1) % ROUND_COLOR.length]} stroke={p.id === winner ? "#ffb547" : "#07080d"} strokeWidth={p.id === winner ? 3 : 1.5} />
            <text x={x(p.cost) + 10} y={y(p.reach) + 3} fontSize={10} fontWeight={700} fill="#eef0f6">
              {p.id}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-dim">
        <span>
          {probes.length} variation{probes.length === 1 ? "" : "s"} tested in the simulator · {plans.length} submitted
        </span>
        {[...new Set(probes.map((p) => p.round))].map((r) => (
          <span key={r} className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ background: ROUND_COLOR[(r - 1) % ROUND_COLOR.length] }} /> round {r}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
