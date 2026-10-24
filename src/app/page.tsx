import Link from "next/link";
import { Hero } from "@/components/home/hero";
import { AgentChip } from "@/components/rehearsal/agents";
import { AGENTS, type AgentName } from "@/lib/agents/events";
import { CITIES } from "@/lib/atlas/cities";
import { CampaignLoop } from "@/components/home/loop";
import { Showcases } from "@/components/home/showcases";
import { campaignLoop, showcaseCards } from "@/lib/home";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

type Band = { mean: number; lo: number; hi: number };
async function coldstart() {
  try {
    const d = JSON.parse(await readFile(join(process.cwd(), "data", "benchmark", "coldstart.json"), "utf8"));
    return {
      n: d.n as number,
      cities: d.cities.length as number,
      targets: d.targets.length as number,
      wins: d.versusClaude.wins as number,
      index: d.summary.index as Record<string, { overlap: Band }>,
    };
  } catch {
    return null;
  }
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

/** The team by kind, so the count in the heading is the count on screen. */
const TEAM_GROUPS: { title: string; note: string; members: AgentName[] }[] = [
  { title: "6 agents", note: "choose their own tools", members: ["director", "analyst", "scout", "strategist", "creative", "field"] },
  { title: "3 single Claude calls", note: "structured outputs", members: ["critic", "voices", "producer"] },
  { title: "Not models", note: "a Qloo mapping tool and the simulator", members: ["cartographer", "simulator"] },
];

/** Neighbourhood cells across every city's atlas. */
async function atlasCells() {
  const sizes = await Promise.all(
    CITIES.map((c) =>
      readFile(join(process.cwd(), "data", "atlas", `${c.id}.json`), "utf8")
        .then((t) => (JSON.parse(t).cells as unknown[]).length)
        .catch(() => 0),
    ),
  );
  return sizes.reduce((a, b) => a + b, 0);
}

const STEPS = [
  {
    n: "01",
    title: "Map the city's taste",
    body: "54 Qloo heatmaps per city (artists, TV shows, brands, games, podcasts and athletes) give every neighbourhood cell, about a kilometre across, a taste fingerprint. Cells cluster into taste districts, and cells with similar taste across town are linked: that is how word of mouth travels.",
  },
  {
    n: "02",
    title: "Find where your launch lands",
    body: "The agents resolve your launch's comparables on Qloo, profile who their fans are, and map where in the city they live, lifted above what every cell shows for anything. A venue adds distance: people travel less the further they live.",
  },
  {
    n: "03",
    title: "Rehearse it hundreds of times",
    body: "Scouts find real partner places, podcasts and brands this crowd loves. The Strategist designs plans and tests variations; the Simulator runs each plan 48 times through a model of word of mouth; the Critic sends them back. Then they do it again.",
  },
  {
    n: "04",
    title: "Get the plan that worked",
    body: "A week-by-week plan with addresses, podcasts and partners, its simulated reach with a bad-case band, the benchmark it beat, and residents' simulated reactions. Every Qloo request behind it is listed in the feed.",
  },
  {
    n: "05",
    title: "Launch it with a kit",
    body: "The Creative Director writes copy for each neighbourhood, checking every cultural reference on Qloo for that neighbourhood first. Posters with a tracked QR code per partner, outreach emails, podcast scripts, an ad-targeting brief and a calendar, in one download.",
  },
  {
    n: "06",
    title: "Steer it with real scans",
    body: "Every poster, post and email carries its own tracked link. Mission control compares each neighbourhood's scans with what the rehearsal expected, and the Field Analyst moves the budget not yet spent, finding new partner places on Qloo where a neighbourhood is behind.",
  },
];

export default async function Home() {
  const [showcases, proof, loop, cells] = await Promise.all([showcaseCards(), coldstart(), campaignLoop("chicago-headline"), atlasCells()]);
  const lifts = showcases.flatMap((s) => (s.reach && s.benchmark ? [s.reach / s.benchmark] : []));
  const proofRows = proof
    ? [
        { label: "Groundswell, from comparables", v: proof.index.groundswell.overlap.mean, hi: true },
        { label: "Claude alone, naming neighbourhoods", v: proof.index.claude.overlap.mean },
        { label: "Going where people are", v: proof.index.people.overlap.mean },
        { label: "Chance", v: 0.1 },
      ]
    : [];
  return (
    <main>
      <Hero />

      <section aria-label="Groundswell in numbers" className="border-y border-line bg-panel/60">
        <dl className="mx-auto grid max-w-[1600px] grid-cols-2 gap-px px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-5">
          {[
            { v: String(CITIES.length), k: "cities modelled from Qloo" },
            { v: cells.toLocaleString("en-US"), k: "neighbourhood cells with a taste fingerprint" },
            { v: "6", k: "Claude agents, from rehearsal to running campaign" },
            ...(proof ? [{ v: `${(proof.index.groundswell.overlap.mean * 100).toFixed(0)}% vs ${(proof.index.claude.overlap.mean * 100).toFixed(0)}%`, k: "of a taste's top neighbourhoods found, against Claude alone" }] : []),
            ...(lifts.length ? [{ v: `${Math.min(...lifts).toFixed(1)}–${Math.max(...lifts).toFixed(1)}×`, k: "the benchmark's reach, across seven recorded rehearsals" }] : []),
          ].map((x) => (
            <div key={x.k} className="px-2 py-5 sm:px-4">
              <dt className="sr-only">{x.k}</dt>
              <dd className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{x.v}</dd>
              <dd className="mt-1 text-[12.5px] leading-snug text-muted">{x.k}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-[1600px] px-4 py-16 sm:px-6" aria-labelledby="watch">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-glow">Watch the team work</p>
            <h2 id="watch" className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Seven rehearsals in seven cities
            </h2>
          </div>
          <p className="max-w-md text-[14px] text-muted">
            Real runs of the full agent team, recorded with every step and Qloo request, so they open instantly. The launches are fictional; the cities, venues, comparables and Qloo data are real.
          </p>
        </div>
        <Showcases cards={showcases} featured="chicago-headline" />
      </section>

      {loop && (
        <section className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-6" aria-labelledby="loop">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-cool">One launch, end to end</p>
              <h2 id="loop" className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Rehearse it. Launch it. Steer it.
              </h2>
            </div>
            <p className="max-w-md text-[14px] text-muted">The Chicago showcase from the recorded run: what the team rehearsed, what the Creative Director wrote, and what mission control shows after a simulated week.</p>
          </div>
          <CampaignLoop loop={loop} />
        </section>
      )}

      {proof && (
        <section className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-6" aria-labelledby="proof">
          <div className="grid gap-6 rounded-3xl border border-line bg-panel p-6 lg:grid-cols-[1fr_1.2fr] lg:p-8">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-good">Does it work?</p>
              <h2 id="proof" className="mt-1 font-display text-3xl leading-tight font-semibold tracking-tight text-balance">
                A launch has no data yet. Comparables find its audience anyway.
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                We hid the Qloo heatmaps of {proof.targets} established artists, brands and shows in {proof.cities} cities ({proof.n} tests) and asked each method to find the neighbourhoods where each one
                is most over-represented. Groundswell, working from three comparables, finds about twice as many as Claude alone or going where people are, and beats Claude in {proof.wins} of {proof.n} tests.
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
          <ol className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
          Six agents, and the team around them
        </h2>
        <p className="mt-2 max-w-3xl text-[15px] text-muted">
          An agent here means Claude chooses which tools to call, in what order, and when it is done. Six roles work that way, from the rehearsal to the running campaign. Three more are single
          Claude calls, and two are not models at all. Rules live in the tools: plans must use only what the scouts found, stay within budget and be rehearsed twice before they ship.
        </p>
        <div className="mt-8 space-y-6">
          {TEAM_GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="mb-2 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">
                <span className="text-text">{g.title}</span>
                <span>{g.note}</span>
              </h3>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.members.map((a) => (
                  <li key={a} className="flex items-start gap-3 rounded-2xl border border-line bg-panel p-4">
                    <AgentChip agent={a} state="done" />
                    <div>
                      <div className="font-semibold">{AGENTS[a].title}</div>
                      <div className="text-[13.5px] text-muted">{AGENTS[a].role.replace(/^(Agent|Model|Tool|Engine): (.)/, (_, _kind, first: string) => first.toUpperCase())}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line bg-panel/50" aria-labelledby="who">
        <div className="mx-auto grid max-w-[1600px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-hot">Who it&apos;s for</p>
            <h2 id="who" className="mt-1 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              A few thousand dollars, a few weeks, and a city of millions
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
              Independent promoters and venues, artists&apos; teams, restaurants and pop-ups, small brands and film distributors launch with small budgets and no research
              department. They put posters and ads where people are, not where their audience is, and find out on the night. The margin for guessing is thin: only 36% of US
              independent venues were profitable in 2024, according to the National Independent Venue Association&apos;s 2025 State of Live report.
            </p>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
              Groundswell gives them what a big company&apos;s research team would: where the audience lives, which plan reaches it, the materials to run it tomorrow, and a way to
              steer once it&apos;s running. On held-out tests, comparables found a taste&apos;s strongest neighbourhoods about twice as often as going where people are (above).
            </p>
            <a
              className="mt-3 inline-block text-[12px] text-dim underline-offset-2 hover:underline"
              href="https://www.axios.com/local/cleveland/2025/10/16/indie-music-venues-profitability-niva-2025"
              target="_blank"
              rel="noreferrer"
            >
              Source: Axios, 16 October 2025, on NIVA&apos;s State of Live report
            </a>
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl border border-line bg-panel p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">What exists today</div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[14px] text-muted marker:text-dim">
                <li>Rehearsals in seven cities, live or recorded, with the plan, what-if edits and where to go next</li>
                <li>A launch kit: copy per neighbourhood, posters with tracked QR codes, emails, scripts, ad brief, calendar</li>
                <li>Mission control with tracked links and the Field Analyst&apos;s re-plans</li>
                <li>An MCP server, so other agents and tools can rehearse launches</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-dashed border-line-2 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">How it could pay for itself (planned, not built)</div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[14px] text-muted marker:text-dim">
                <li>Free rehearsals; a per-launch fee for the kit and mission control</li>
                <li>Ticketing platforms and promoters calling it through the API or MCP, per rehearsal</li>
                <li>More cities: building one city&apos;s atlas takes 108 Qloo requests and a few minutes</li>
              </ul>
            </div>
          </div>
        </div>
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
