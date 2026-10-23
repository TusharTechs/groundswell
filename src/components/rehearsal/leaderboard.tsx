"use client";

// Every plan the team tried, rehearsed 48 times each: mean reach of the natural
// audience with its 10th–90th percentile band, against the benchmark that
// spends the same budget where people are.

import type { SimView, StrategyView } from "@/lib/agents/events";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function Leaderboard({
  strategies,
  sims,
  baseline,
  selected,
  onSelect,
  winner,
}: {
  strategies: StrategyView[];
  sims: Record<string, SimView>;
  baseline?: SimView;
  selected?: string;
  onSelect: (id: string) => void;
  winner?: string;
}) {
  const rows = strategies.filter((s) => sims[s.id]);
  if (!rows.length && !baseline) return null;
  const max = Math.max(0.05, baseline?.metrics.reach.p90 ?? 0, ...rows.map((r) => sims[r.id].metrics.reach.p90)) * 1.08;
  const bar = (m: SimView["metrics"], color: string) => (
    <div className="relative h-2.5 w-full rounded-full bg-panel-3">
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(m.reach.mean / max) * 100}%`, background: color }} />
      <div
        className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-text/60"
        style={{ left: `${(m.reach.p10 / max) * 100}%`, width: `${Math.max(0.6, ((m.reach.p90 - m.reach.p10) / max) * 100)}%` }}
        title={`10th–90th percentile: ${pct(m.reach.p10)}–${pct(m.reach.p90)}`}
      />
    </div>
  );
  return (
    <div className="space-y-1">
      {baseline && (
        <div className="grid grid-cols-[3.2rem_1fr_4.2rem] items-center gap-2 px-2 py-1 text-[12px] text-muted">
          <span className="font-mono text-[11px]">BENCH</span>
          <div>
            <div className="mb-1 truncate">Same budget, spent where people are (no taste data)</div>
            {bar(baseline.metrics, "#5b6280")}
          </div>
          <span className="text-right font-mono">{pct(baseline.metrics.reach.mean)}</span>
        </div>
      )}
      {rows.map((s) => {
        const m = sims[s.id].metrics;
        const lift = baseline ? m.reach.mean / Math.max(1e-6, baseline.metrics.reach.mean) : null;
        const isWinner = winner === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className={`grid w-full grid-cols-[3.2rem_1fr_4.2rem] items-center gap-2 rounded-lg px-2 py-1 text-left text-[12px] transition-colors ${selected === s.id ? "bg-panel-3" : "hover:bg-panel-2"}`}
            aria-pressed={selected === s.id}
          >
            <span className={`font-mono text-[11px] ${isWinner ? "text-glow" : "text-muted"}`}>{s.id}</span>
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-1.5 truncate">
                <span className="truncate font-medium text-text">{s.name}</span>
                {isWinner && <span className="rounded-full bg-glow/15 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-glow">chosen</span>}
                <span className="text-dim">${s.cost.toLocaleString()}</span>
              </div>
              {bar(m, isWinner ? "linear-gradient(90deg,#ffb547,#ff5c8a)" : s.round > 1 ? "#ff8fb0" : "#c98a52")}
            </div>
            <span className="text-right font-mono">
              {pct(m.reach.mean)}
              {lift && <span className="block text-[10px] text-good">{lift.toFixed(1)}× bench</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
