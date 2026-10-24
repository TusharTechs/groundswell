// One launch, end to end, from the recorded data: the plans the team rehearsed
// against the benchmark, the kit's copy for one neighbourhood with the Qloo
// checks behind it, and a simulated week in mission control.

import Image from "next/image";
import Link from "next/link";
import type { Loop } from "@/lib/home";
import { AgentIcon } from "../rehearsal/agents";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const VERDICT: Record<string, string> = { ahead: "text-hot", behind: "text-[#8fb6ff]", "on track": "text-glow", "too early": "text-dim" };

export function CampaignLoop({ loop }: { loop: Loop }) {
  const maxPlan = Math.max(loop.benchmark, ...loop.plans.map((p) => p.reach)) * 1.08;
  const maxWeek = Math.max(1, ...loop.week.flatMap((w) => [w.observed, w.expected])) * 1.1;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <article className="flex flex-col rounded-3xl border border-line bg-panel p-5">
        <Step n="1" title="Rehearse" agent="strategist" note="Every plan the team rehearsed, against the same budget spent where people are." />
        <ul className="mt-4 flex-1 space-y-2">
          {loop.plans.map((p) => (
            <li key={p.id} className="grid grid-cols-[2rem_1fr_3.2rem] items-center gap-2 text-[12px]">
              <span className={`font-mono ${p.chosen ? "text-glow" : "text-dim"}`}>{p.id}</span>
              <div className="h-2.5 rounded-full bg-panel-3" title={p.name}>
                <div className={`h-2.5 rounded-full ${p.chosen ? "bg-gradient-to-r from-glow to-hot" : "bg-[#c98a52]/70"}`} style={{ width: `${(p.reach / maxPlan) * 100}%` }} />
              </div>
              <span className={`text-right font-mono ${p.chosen ? "text-text" : "text-muted"}`}>{pct(p.reach)}</span>
            </li>
          ))}
          <li className="grid grid-cols-[2rem_1fr_3.2rem] items-center gap-2 border-t border-line pt-2 text-[12px]">
            <span className="font-mono text-dim">BM</span>
            <div className="h-2.5 rounded-full bg-panel-3">
              <div className="h-2.5 rounded-full bg-[#5b6280]" style={{ width: `${(loop.benchmark / maxPlan) * 100}%` }} />
            </div>
            <span className="text-right font-mono text-muted">{pct(loop.benchmark)}</span>
          </li>
        </ul>
        <p className="mt-3 text-[11.5px] text-dim">Simulated reach of the natural audience by launch day; the chosen plan is highlighted, the last row is the benchmark.</p>
        <Link href={`/rehearse/${loop.id}`} className="mt-3 text-[13px] text-cool underline-offset-4 hover:underline">
          Watch the rehearsal →
        </Link>
      </article>

      <article className="flex flex-col rounded-3xl border border-line bg-panel p-5">
        <Step n="2" title="Launch" agent="creative" note={`The kit's copy for ${loop.kit?.zone ?? "one neighbourhood"}, with the references the Creative Director checked on Qloo first.`} />
        {loop.kit && (
          <div className="mt-4 flex flex-1 gap-3">
            {loop.kit.poster && (
              <div className="relative w-28 shrink-0 self-start overflow-hidden rounded-lg border border-line" style={{ aspectRatio: "4 / 5" }}>
                <Image src={loop.kit.poster} alt={`Poster for ${loop.kit.zone}`} fill sizes="112px" className="object-cover" />
              </div>
            )}
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap gap-1">
                {loop.kit.references.map((r) => (
                  <span key={r.name} className={`rounded-full px-2 py-0.5 text-[10.5px] ${r.verdict === "strong here" ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>
                    {r.name} · {r.verdict}
                  </span>
                ))}
              </div>
              <p className="line-clamp-6 text-[12.5px] leading-snug text-text/90">“{loop.kit.instagram}”</p>
            </div>
          </div>
        )}
        <p className="mt-3 text-[11.5px] text-dim">Plus a poster per partner with its own tracked QR code, outreach emails, podcast scripts, an ad brief and a calendar.</p>
        <Link href={`/rehearse/${loop.id}`} className="mt-3 text-[13px] text-cool underline-offset-4 hover:underline">
          Open the launch kit →
        </Link>
      </article>

      <article className="flex flex-col rounded-3xl border border-line bg-panel p-5">
        <Step n="3" title="Steer" agent="field" note="Scans per neighbourhood against what the rehearsal expected. This week is simulated, and labelled so in the app." />
        <ul className="mt-4 flex-1 space-y-3">
          {loop.week.map((w) => (
            <li key={w.locality} className="text-[12px]">
              <div className="mb-1 flex justify-between gap-2">
                <span className="truncate">{w.locality}</span>
                <span className={`font-semibold uppercase tracking-wider text-[10.5px] ${VERDICT[w.verdict] ?? "text-dim"}`}>{w.verdict}</span>
              </div>
              <div className="space-y-0.5">
                <div className="h-2 rounded-full bg-panel-3">
                  <div className="h-2 rounded-full bg-gradient-to-r from-cool to-[#56b4ff]" style={{ width: `${(w.observed / maxWeek) * 100}%` }} />
                </div>
                <div className="h-1 rounded-full bg-panel-3">
                  <div className="h-1 rounded-full bg-[#5b6280]" style={{ width: `${(w.expected / maxWeek) * 100}%` }} />
                </div>
              </div>
              <div className="mt-0.5 font-mono text-[10.5px] text-dim">
                {w.observed} scans · {w.expected.toFixed(0)} expected
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11.5px] text-dim">
          {loop.weekTotal} simulated scans. The Field Analyst then searches Qloo for new partners where a neighbourhood is behind and moves the budget not yet spent.
        </p>
        <Link href={`/campaign/${loop.id}`} className="mt-3 text-[13px] text-cool underline-offset-4 hover:underline">
          Open mission control →
        </Link>
      </article>
    </div>
  );
}

function Step({ n, title, agent, note }: { n: string; title: string; agent: "strategist" | "creative" | "field"; note: string }) {
  return (
    <header>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12px] text-glow">0{n}</span>
        <AgentIcon agent={agent} />
        <h3 className="font-display text-xl font-semibold">{title}</h3>
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-muted">{note}</p>
    </header>
  );
}
