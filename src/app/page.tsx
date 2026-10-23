import Link from "next/link";
import { Hero } from "@/components/home/hero";
import { AgentChip } from "@/components/rehearsal/agents";
import { AGENTS, type AgentName } from "@/lib/agents/events";
import { CITIES } from "@/lib/atlas/cities";
import { showcaseSummaries } from "@/lib/showcase";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

type Band = { mean: number; lo: number; hi: number };
async function coldstart() {
  try {
    const d = JSON.parse(await readFile(join(process.cwd(), "data", "benchmark", "coldstart.json"), "utf8"));
    return { n: d.n as number, cities: d.cities.length as number, wins: d.versusClaude.wins as number, index: d.summary.index as Record<string, { overlap: Band }> };
  } catch {
    return null;
  }
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

const STEPS = [
  {
    n: "01",
    title: "Map the city's taste",
    body: "54 Qloo heatmaps per city (artists, shows, brands, games, podcasts, athletes) give every ~1 km neighbourhood cell a taste fingerprint. Cells cluster into taste districts, and cells with similar taste across town are linked: that is how word of mouth travels.",
  },
  {
    n: "02",
    title: "Find where your launch lands",
    body: "The agents resolve your launch's comparables on Qloo, profile who their fans are, and map where in the city they live, lifted above what every cell shows for anything. A venue adds distance: people travel less the further they live.",
  },
  {
    n: "03",
    title: "Rehearse it hundreds of times",
    body: "Scouts find real partner places, podcasts and brands this crowd loves. The Strategist designs plans and tests ideas; the Simulator runs each 48 times through a model of word of mouth; the Critic sends them back. Then they do it again.",
  },
  {
    n: "04",
    title: "Get the plan that worked",
    body: "A week-by-week plan with addresses, podcasts and partners, its simulated reach with a bad-case band, the benchmark it beat, and residents' simulated reactions. Every number links back to the Qloo request behind it.",
  },
];

export default async function Home() {
  const [showcases, proof] = await Promise.all([showcaseSummaries(), coldstart()]);
  const proofRows = proof
    ? [
        { label: "Groundswell, from comparables", v: proof.index.groundswell.overlap.mean, hi: true },
        { label: "Claude alone, naming neighbourhoods", v: proof.index.claude.overlap.mean },
        { label: "Going where people are", v: proof.index.people.overlap.mean },
        { label: "Chance", v: 0.1 },
      ]
    : [];
  const team: AgentName[] = ["director", "analyst", "cartographer", "scout", "strategist", "simulator", "critic", "voices", "producer"];
  return (
    <main>
      <Hero />

      <section className="mx-auto max-w-[1600px] px-4 py-16 sm:px-6" aria-labelledby="watch">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-glow">Watch the team work</p>
            <h2 id="watch" className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Seven rehearsals in seven cities
            </h2>
          </div>
          <p className="max-w-md text-[14px] text-muted">Real runs of the full agent team, recorded with every step and Qloo request, so they open instantly.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {showcases.map((s) => {
            const city = CITIES.find((c) => c.id === s.cityId)!;
            const lift = s.reach && s.benchmark ? s.reach / s.benchmark : null;
            return (
              <li key={s.id}>
                <Link
                  href={s.recorded ? `/rehearse/${s.id}` : "#"}
                  className={`group flex h-full flex-col justify-between gap-4 rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-glow/50 hover:bg-panel-2 ${s.recorded ? "" : "pointer-events-none opacity-50"}`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">
                      <span>{s.kind}</span>
                      <span>{city.name}</span>
                    </div>
                    <h3 className="mt-2 font-display text-xl leading-tight font-semibold">{s.title}</h3>
                    <p className="mt-1 text-[13.5px] text-muted">{s.blurb}</p>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    {s.reach !== undefined ? (
                      <div>
                        <div className="font-display text-2xl font-semibold text-gradient">{pct(s.reach)}</div>
                        <div className="text-[11px] text-dim">reached{lift ? ` · ${lift.toFixed(1)}× the benchmark` : ""}</div>
                      </div>
                    ) : (
                      <span className="text-[12px] text-dim">{s.recorded ? "Recorded" : "Not recorded yet"}</span>
                    )}
                    <span className="rounded-full border border-line px-3 py-1 text-[12px] text-muted transition-colors group-hover:border-text group-hover:text-text">Watch</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {proof && (
        <section className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-6" aria-labelledby="proof">
          <div className="grid gap-6 rounded-3xl border border-line bg-panel p-6 lg:grid-cols-[1fr_1.2fr] lg:p-8">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-good">Does it work?</p>
              <h2 id="proof" className="mt-1 font-display text-3xl leading-tight font-semibold tracking-tight text-balance">
                A launch has no data yet. Comparables find its audience anyway.
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                We hid the Qloo heatmaps of {proof.n} established artists, brands and shows across {proof.cities} cities and asked each method to find the neighbourhoods where
                each one is most over-represented. Groundswell, working from three comparables, finds about twice as many as Claude alone or going where people are, and beats
                Claude in {proof.wins} of {proof.n} tests.
              </p>
              <Link href="/method#evidence" className="mt-4 inline-block text-[14px] text-cool underline-offset-4 hover:underline">
                Method, controls and the case where it loses →
              </Link>
            </div>
            <ul className="space-y-3 self-center">
              {proofRows.map((r) => (
                <li key={r.label} className="grid grid-cols-[minmax(0,13rem)_1fr_3.5rem] items-center gap-3 text-[14px]">
                  <span className={r.hi ? "font-semibold" : "text-muted"}>{r.label}</span>
                  <div className="h-3 rounded-full bg-panel-3">
                    <div className={`h-full rounded-full ${r.hi ? "bg-gradient-to-r from-glow to-hot" : "bg-[#5b6280]"}`} style={{ width: `${(r.v / 0.5) * 100}%` }} />
                  </div>
                  <span className="text-right font-mono">{pct(r.v)}</span>
                </li>
              ))}
              <li className="text-[12px] text-dim">Share of each taste&apos;s top 10% of neighbourhoods found, without seeing its own data.</li>
            </ul>
          </div>
        </section>
      )}

      <section className="border-y border-line bg-panel/50" aria-labelledby="how">
        <div className="mx-auto max-w-[1600px] px-4 py-16 sm:px-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-cool">How it works</p>
          <h2 id="how" className="mt-1 max-w-3xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Most launches are planned on instinct. This one gets rehearsed first.
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl border border-line bg-panel p-5">
                <div className="font-mono text-[12px] text-glow">{s.n}</div>
                <h3 className="mt-2 font-display text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
          <Link href="/method" className="mt-6 inline-block text-[14px] text-cool underline-offset-4 hover:underline">
            The model, the data and its limits →
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-[1600px] px-4 py-16 sm:px-6" aria-labelledby="team">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-accent">Agents, but with taste</p>
        <h2 id="team" className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Nine agents, one city model
        </h2>
        <p className="mt-2 max-w-2xl text-[15px] text-muted">
          A Director agent runs the rehearsal and decides what to do next. Each teammate is a tool it calls; the Strategist itself tests ideas in the simulator before it commits. Rules
          live in the tools: plans must use only what the scouts found, stay within budget and be rehearsed twice before they ship.
        </p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {team.map((a) => (
            <li key={a} className="flex items-start gap-3 rounded-2xl border border-line bg-panel p-4">
              <AgentChip agent={a} state="done" />
              <div>
                <div className="font-semibold">{AGENTS[a].title}</div>
                <div className="text-[13.5px] text-muted">{AGENTS[a].role}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-8 text-[13px] text-dim sm:px-6">
          <span>Groundswell · built on the Qloo Taste AI API and Claude · for the Qloo Agentic Hackathon</span>
          <span className="flex gap-4">
            <Link href="/atlas" className="hover:text-text">
              Taste Atlas
            </Link>
            <Link href="/method" className="hover:text-text">
              How it works
            </Link>
          </span>
        </div>
      </footer>
    </main>
  );
}
