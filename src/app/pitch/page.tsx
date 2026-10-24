import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CITIES } from "@/lib/atlas/cities";
import { showcaseSummaries } from "@/lib/showcase";

export const metadata: Metadata = {
  title: "The case",
  description: "Who Groundswell is for, what exists today, how it could become a business, and how it handles trust and safety.",
};

const SOURCES = [
  { id: "eventbrite", label: "Eventbrite, fourth-quarter and full-year 2024 results, 27 February 2025", href: "https://www.businesswire.com/news/home/20250227607042/en" },
  { id: "livenation", label: "Live Nation Entertainment, full-year and fourth-quarter 2024 results", href: "https://newsroom.livenation.com/news/live-nation-entertainment-reports-full-year-and-fourth-quarter-2024-results/" },
  {
    id: "niva",
    label: "National Independent Venue Association, statement on the 2025 State of Live state reports",
    href: "https://www.nivassoc.org/statements/2025/national-independent-venue-association-releases-50-state-studies-that-show-the-outsized-economic-power-of-independent-live-entertainment",
  },
];

function Cite({ id }: { id: string }) {
  const n = SOURCES.findIndex((s) => s.id === id) + 1;
  return (
    <a href={`#source-${n}`} className="align-super text-[10px] text-cool no-underline hover:underline" aria-label={`Source ${n}`}>
      [{n}]
    </a>
  );
}

const PEOPLE = [
  { who: "Independent promoters and venues", gets: "Rehearse each show before booking spend; partner places and posters for the neighbourhoods that matter; mission control during the run." },
  { who: "Artists, comedians and their managers", gets: "A first headline show that finds its crowd, and where the same taste is strongest in the next city on the tour." },
  { who: "Restaurants, pop-ups and retail openings", gets: "Which blocks to flyer, which cafés and shops to partner with, and copy that sounds like each neighbourhood." },
  { who: "Supporters' groups, teams and leagues", gets: "Where fans concentrate in a city, including a new market, and which local places to build match nights around." },
  { who: "Film distributors", gets: "Preview weeks that start in the neighbourhoods where the comparable films over-index." },
  { who: "Ticketing and event platforms", gets: "A rehearsed plan and launch kit with every listing, through the API or the MCP server." },
];

export default async function Pitch() {
  const showcases = await showcaseSummaries();
  const lifts = showcases.flatMap((s) => (s.reach && s.benchmark ? [s.reach / s.benchmark] : []));
  const cold = await readFile(join(process.cwd(), "data", "benchmark", "coldstart.json"), "utf8")
    .then((t) => JSON.parse(t) as { n: number; summary: { index: Record<string, { overlap: { mean: number } }> } })
    .catch(() => null);
  const pctOf = (k: string) => (cold ? `${(cold.summary.index[k].overlap.mean * 100).toFixed(1)}%` : "—");

  return (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6">
      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-hot">The case</p>
      <h1 className="mt-1 max-w-3xl font-display text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
        Every launch is a bet on where its audience is. Most are placed blind.
      </h1>
      <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-muted">
        Groundswell is a flight simulator for culture: rehearse a launch in a model of the city built from Qloo&apos;s taste graph, run it with a kit made for each neighbourhood, and steer it from
        what people actually scan. This page is the business case. What is built is marked as built; what is planned is marked as planned.
      </p>

      <section className="mt-12 grid gap-3 sm:grid-cols-3">
        <Stat value="4.7 million" label="events on Eventbrite in 2024 alone" cite="eventbrite" />
        <Stat value="50,000+" label="Live Nation events in 2024, with 151 million fans" cite="livenation" />
        <Stat value="64%" label="of US independent stages reported a loss in 2024" cite="niva" />
      </section>
      <p className="mt-3 text-[13px] text-dim">
        Each of those events is a launch: a date, a budget, a city, and a guess about where the people who would love it live. Large promoters have data teams; a comedy night, a pop-up or a
        venue&apos;s Tuesday show usually has a few thousand dollars and a few weeks.
      </p>

      <Block kicker="01" title="Who it's for">
        <ul className="grid gap-3 sm:grid-cols-2">
          {PEOPLE.map((p) => (
            <li key={p.who} className="rounded-2xl border border-line bg-panel p-4">
              <div className="font-semibold">{p.who}</div>
              <p className="mt-1 text-[14px] leading-relaxed text-muted">{p.gets}</p>
            </li>
          ))}
        </ul>
      </Block>

      <Block kicker="02" title="What exists today">
        <div className="grid gap-3 md:grid-cols-3">
          <Card title="Rehearse" tone="glow">
            Live and recorded rehearsals in {CITIES.length} cities: comparables on Qloo, where the taste lives, real partner places, plans tested in a simulator against a benchmark, the plan that
            worked, what-if edits, and where the same taste is strongest elsewhere.
          </Card>
          <Card title="Launch" tone="hot">
            A kit per launch: copy for each neighbourhood with its references checked on Qloo, posters with tracked QR codes, partner emails, podcast scripts, an ad brief, a calendar, a launch page.
            Japanese and Spanish where the city calls for it.
          </Card>
          <Card title="Steer" tone="cool">
            Mission control with tracked links per poster, post and email, each neighbourhood against expectation, and a Field Analyst agent that re-plans the budget not yet spent.
          </Card>
        </div>
        <p className="mt-3 text-[14px] text-muted">
          Evidence: from comparables alone, Groundswell finds {pctOf("groundswell")} of a taste&apos;s strongest neighbourhoods, against {pctOf("claude")} for Claude alone and {pctOf("people")} for
          going where people are ({cold?.n ?? 77} tests). In seven recorded rehearsals the plans reach {lifts.length ? `${Math.min(...lifts).toFixed(1)}–${Math.max(...lifts).toFixed(1)}×` : "several times"}{" "}
          the benchmark&apos;s reach in simulation.{" "}
          <Link href="/method#evidence" className="text-cool underline underline-offset-2">
            How it&apos;s measured
          </Link>
        </p>
      </Block>

      <Block kicker="03" title="How it could make money (planned, not built)">
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-panel-2 text-[11px] uppercase tracking-wider text-dim">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Offer</th>
                <th className="px-4 py-2.5 font-semibold">For</th>
                <th className="px-4 py-2.5 font-semibold">Price hypothesis (untested)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr>
                <td className="px-4 py-3">Rehearsals</td>
                <td className="px-4 py-3 text-muted">Anyone planning a launch</td>
                <td className="px-4 py-3 text-muted">Free, a few a month</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Launch kit and mission control</td>
                <td className="px-4 py-3 text-muted">Organisers, artists, openings</td>
                <td className="px-4 py-3 text-muted">A fee per launch</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Unlimited rehearsals and campaigns</td>
                <td className="px-4 py-3 text-muted">Promoters and venues with a calendar</td>
                <td className="px-4 py-3 text-muted">A monthly subscription</td>
              </tr>
              <tr>
                <td className="px-4 py-3">API and MCP access</td>
                <td className="px-4 py-3 text-muted">Ticketing and event platforms</td>
                <td className="px-4 py-3 text-muted">Per rehearsal, or a share of kit revenue</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[14px] text-muted">
          Prices would be set with the first customers, against what a rehearsal costs to run: about 24–29 Claude calls and 27–56 Qloo requests each in the recorded runs.
        </p>
      </Block>

      <Block kicker="04" title="Why it gets better with use">
        <ol className="grid gap-3 md:grid-cols-4">
          {[
            ["A rehearsal", "plans a launch from Qloo's taste graph and a simulator."],
            ["The kit's tracked links", "record which neighbourhoods and channels actually brought people."],
            ["Those outcomes", "can calibrate each channel's effect, city by city (planned)."],
            ["The next rehearsal", "starts from measured effects instead of stated assumptions."],
          ].map(([a, b], i) => (
            <li key={a} className="relative rounded-2xl border border-line bg-panel p-4">
              <div className="font-mono text-[12px] text-glow">{String(i + 1).padStart(2, "0")}</div>
              <div className="mt-1 font-semibold">{a}</div>
              <p className="mt-1 text-[13.5px] text-muted">{b}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[14px] text-muted">
          Every city added is reusable by every launch there: building one city&apos;s atlas takes 108 Qloo requests. And the method is checked, not assumed: the benchmark above is reproducible with{" "}
          <code className="rounded bg-panel-3 px-1.5 py-0.5 font-mono text-[0.85em] text-cool">npm run benchmark</code>.
        </p>
      </Block>

      <Block kicker="05" title="What people use today, and what's different">
        <div className="grid gap-3 md:grid-cols-3">
          <Card title="Guessing">The organiser&apos;s instinct and last year&apos;s spots. Free, fast, and blind to where a new audience lives.</Card>
          <Card title="Ads platforms">Interest targeting finds people who like similar things, but says little about which streets, cafés and venues they share, or what to put on a poster there.</Card>
          <Card title="Agencies and research">Thorough, and usually priced and paced for big launches.</Card>
        </div>
        <p className="mt-3 text-[14px] text-muted">
          Groundswell sits between them: street-level taste geography from Qloo, plans tested before money is spent, the materials to act the same day, and a feedback loop once the campaign runs.
        </p>
      </Block>

      <Block kicker="06" title="Getting it to people (planned)">
        <ul className="list-disc space-y-1.5 pl-5 text-[15px] text-text/90 marker:text-dim">
          <li>Start with independent promoters and venues in the seven modelled cities, where a rehearsal is ready today.</li>
          <li>Offer it inside the tools organisers already use: the MCP server and API let a ticketing or booking platform attach a plan to a listing.</li>
          <li>Add cities where the first customers tour next; the pipeline that built seven can build more.</li>
        </ul>
      </Block>

      <Block kicker="07" title="Trust and safety">
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            ["No personal data to Qloo", "Only entity names, tags and the locations of cities, neighbourhoods and venues. Qloo results describe aggregate taste, not individuals."],
            ["Minimal tracking", "A scan stores its link code, time, a coarse country and whether it was simulated; nothing else about the person. Link-preview bots are not counted."],
            ["Copy that can be backed", "References are checked on Qloo for each neighbourhood before use; claims like “sold out” and assumptions about a partner's premises are rejected by the tool, not just discouraged."],
            ["No profiling of people", "District names, copy and simulated residents are written with rules against describing people by ethnicity, religion, health, income or politics."],
            ["Partners say yes first", "The kit drafts an email asking each place for permission; the organiser sends it, and posters go up only where a place agrees."],
            ["Honest labels", "Showcase launches are fictional and say so on every page, poster and launch page; simulated scans and simulated residents are labelled as such."],
          ].map(([t, b]) => (
            <li key={t} className="rounded-2xl border border-line bg-panel p-4">
              <div className="font-semibold">{t}</div>
              <p className="mt-1 text-[14px] leading-relaxed text-muted">{b}</p>
            </li>
          ))}
        </ul>
      </Block>

      <Block kicker="08" title="Honest status">
        <ul className="list-disc space-y-1.5 pl-5 text-[15px] text-text/90 marker:text-dim">
          <li>Built for the Qloo Agentic Hackathon by Tushar Agarwal with Claude Code. No customers or revenue yet.</li>
          <li>Reach is simulated, not forecast; the benchmark tests where an audience is, not ticket sales. Mission control is how real outcomes would be collected.</li>
          <li>Qloo&apos;s coverage varies by city and taste: 7 of 84 benchmark tests were skipped where a heatmap covered under 15% of a city.</li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/rehearse/chicago-headline" className="rounded-full bg-text px-4 py-2 text-[14px] font-semibold text-ink hover:bg-glow">
            Watch a rehearsal
          </Link>
          <Link href="/" className="rounded-full border border-line px-4 py-2 text-[14px] hover:border-text">
            Rehearse your own launch
          </Link>
          <Link href="/method" className="rounded-full border border-line px-4 py-2 text-[14px] hover:border-text">
            How it works
          </Link>
        </div>
      </Block>

      <section className="mt-14 border-t border-line pt-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">Sources</h2>
        <ol className="mt-2 space-y-1 text-[13px] text-muted">
          {SOURCES.map((s, i) => (
            <li key={s.id} id={`source-${i + 1}`}>
              [{i + 1}]{" "}
              <a href={s.href} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-text hover:underline">
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function Stat({ value, label, cite }: { value: string; label: string; cite: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <div className="font-display text-4xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-[14px] text-muted">
        {label} <Cite id={cite} />
      </div>
    </div>
  );
}

function Block({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-[13px] text-glow">{kicker}</span>
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Card({ title, tone, children }: { title: string; tone?: "glow" | "hot" | "cool"; children: React.ReactNode }) {
  const accent = tone === "glow" ? "text-glow" : tone === "hot" ? "text-hot" : tone === "cool" ? "text-cool" : "text-text";
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className={`font-display text-lg font-semibold ${accent}`}>{title}</div>
      <p className="mt-1 text-[14px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}
