import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_PARAMS } from "@groundswell/sim";
import { ASSUMPTIONS } from "@/lib/launch/actions";
import { TRAVEL_SCALE_KM } from "@/lib/launch/venue";
import { CITIES } from "@/lib/atlas/cities";
import { PROBES } from "@/lib/atlas/probes";

export const metadata: Metadata = {
  title: "How it works",
  description: "The city model, the simulation, the agents, the evidence and the limits behind Groundswell.",
};

type Band = { mean: number; lo: number; hi: number };
type Coldstart = {
  n: number;
  cities: string[];
  targets: string[];
  summary: Record<"index" | "volume", Record<string, { overlap: Band; capture: Band; spearman: Band }>>;
  byCity: Record<string, Record<"index" | "volume", Record<string, number | null>>>;
  versusClaude: { wins: number; ties: number; losses: number };
  skipped: { city: string; target: string; reason: string }[];
};
type Calibration = {
  params: Record<string, number>;
  rows: { city: string; venue: string | null; zones: string[]; reach: Record<string, number> }[];
  scenarios: { city: string; comps: string[]; venue: string }[];
};

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(join(process.cwd(), "data", "benchmark", file), "utf8")) as T;
  } catch {
    return null;
  }
}

const pct = (x: number | null | undefined, d = 0) => (x === null || x === undefined ? "—" : `${(x * 100).toFixed(d)}%`);

const METHOD_LABEL: Record<string, string> = {
  groundswell: "Groundswell: comparables, as an index",
  compsRaw: "The same comparables, raw heatmap",
  claude: "Claude alone, naming neighbourhoods",
  people: "Where people are (activity only)",
  control: "Control: the correction alone",
};

export default async function Method() {
  const [cold, cal] = await Promise.all([readJson<Coldstart>("coldstart.json"), readJson<Calibration>("calibration.json")]);
  const order = ["groundswell", "compsRaw", "claude", "people", "control"];
  const idx = cold?.summary.index;
  const vol = cold?.summary.volume;
  const maxBar = Math.max(0.1, ...order.map((m) => idx?.[m]?.overlap.mean ?? 0));
  const A = ASSUMPTIONS;
  const P = DEFAULT_PARAMS;

  return (
    <main className="mx-auto max-w-4xl px-4 pt-10 pb-24 sm:px-6">
      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-cool">How it works</p>
      <h1 className="mt-1 font-display text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">A model of the city, a team of agents, and the evidence</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-muted">
        Groundswell turns Qloo&apos;s taste graph into a street-level model of {CITIES.length} cities, lets a team of Claude agents rehearse a launch inside it, and checks the one thing everything
        rests on: that comparables are enough to find where a new launch&apos;s audience lives. This page says how each part works, what it assumes, and what it cannot tell you.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2 text-[13px]" aria-label="On this page">
        {[
          ["#atlas", "The city model"],
          ["#fit", "Where a launch lands"],
          ["#sim", "The simulation"],
          ["#evidence", "Evidence"],
          ["#calibration", "Calibration"],
          ["#agents", "The agents"],
          ["#kit", "Launch kit and mission control"],
          ["#qloo", "Qloo, end to end"],
          ["#limits", "Limits"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full border border-line px-3 py-1 text-muted hover:border-text hover:text-text">
            {label}
          </a>
        ))}
      </nav>

      <Section id="atlas" kicker="1" title="The city model: a Taste Atlas">
        <p>
          For each city, Qloo&apos;s heatmap insight (<Code>filter.type=urn:heatmap</Code>, a point and radius) is pulled for {PROBES.length} probe entities: artists, series, brands, games, podcasts
          and athletes chosen to span taste and to exist in every city. Qloo answers with geohash cells; at a 16–25 km radius those are about 1.2 × 0.6 km. Every cell that appears for at least eight
          probes joins the grid: {CITIES.length} cities, about 10,600 cells.
        </p>
        <p>
          Each cell gets a fingerprint: its percentile for every probe, within the city. Qloo returns a cell only where it has data, so busy downtown cells appear for everything. To find taste rather
          than density, each probe&apos;s values are corrected for how many probes the cell appears in, clipped, weighted by how much of the city the probe covers (probes in under 45% of cells are
          left out of the clustering), and centred on the cell&apos;s own mean.
        </p>
        <p>
          Cells cluster into five to seven <em>taste districts</em> (k-means, with k chosen by how well separated the clusters are). Claude names each district from its signature only, with rules
          against inferring ethnicity, income, religion or other personal traits. Every cell also gets <em>weak ties</em>: the four most taste-similar cells at least 3 km away. That is how word of
          mouth crosses town in the simulation.
        </p>
      </Section>

      <Section id="fit" kicker="2" title="Where a launch lands">
        <p>
          The agents resolve the launch&apos;s comparables on Qloo (<Code>/search</Code>, with a name check so a lookalike is never accepted) and pull one heatmap of their fans. A cell&apos;s{" "}
          <em>fit</em> is its percentile for the comparables minus its baseline (its mean percentile across all probes), re-ranked from 0 to 1: the marketer&apos;s index, where the taste is
          over-represented. Population comes separately: every cell gets a floor plus a damped share of its Qloo activity, so residential neighbourhoods are not under-counted next to busy ones.
        </p>
        <p>
          When the launch has a venue, the Cartographer finds it on Qloo and weights each cell by the share of people who would travel, <Code>exp(−distance / {TRAVEL_SCALE_KM} km)</Code>, the distance
          decay of Huff&apos;s gravity model of where people shop. A cell&apos;s natural audience is population × {P.audienceShare} × fit³ × travel.
        </p>
      </Section>

      <Section id="sim" kicker="3" title="The simulation">
        <p>
          Every day of the campaign, each potential adopter in a cell who has not adopted yet does so with probability <Code>1 − e^−h</Code>, with
        </p>
        <pre className="my-3 overflow-x-auto rounded-xl border border-line bg-panel-2 p-4 font-mono text-[13px] text-text">h = baseRate + Σ promotion reaching the cell today + wom × exposure^k</pre>
        <p>
          <em>Exposure</em> is the share of the natural audience in the cell&apos;s social neighbourhood (the cell, its adjacent cells and its weak ties) currently talking about the launch. Talk
          fades: each day&apos;s new adopters keep talking with a half-life of {P.buzzHalfLife} days. The exponent k = {P.womExponent} makes it <em>complex contagion</em>: people take up culture when
          several around them have, so dense local buzz spreads where thin awareness fizzles. Adoption counts are drawn from binomials, and every plan runs {P.runs} times with different seeds; results
          show the mean and the 10th–90th percentile.
        </p>
        <p className="text-[14px] text-dim">
          Grounded in Bass (1969) for imitation, Hägerstrand (1967) for neighbourhood effects in diffusion, Centola &amp; Macy (2007) and Centola (2010) for complex contagion, and Huff (1963) for
          distance decay.
        </p>
        <Table
          head={["Parameter", "Value", "What it means"]}
          rows={[
            ["baseRate", `${P.baseRate}/day`, "Discovering the launch with no promotion at all."],
            ["wom", String(P.wom), "Word-of-mouth hazard when a whole neighbourhood is talking."],
            ["k", String(P.womExponent), "Complex contagion: above 1, clustered buzz beats thin awareness."],
            ["Buzz half-life", `${P.buzzHalfLife} days`, "How long new adopters keep talking."],
            ["Ties", "self 1, adjacent 0.6, weak ties 0.35", "Weights of a cell's social neighbourhood."],
            ["Runs", String(P.runs), "Monte Carlo runs per plan (96 for the final plan)."],
          ]}
        />
        <h3 className="mt-6 mb-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-dim">What each action does (stated assumptions)</h3>
        <Table
          head={["Action", "Cost", "Effect in the model"]}
          rows={[
            ["Partner place", `$${A.partner.cost}`, A.partner.note],
            ["Pop-up or launch party", `$${A.popup.cost}`, A.popup.note],
            ["Street team day", `$${A.street.costPerDay}/day`, A.street.note],
            ["Podcast host-read", `$${A.podcast.baseCost}–${A.podcast.baseCost + A.podcast.popularityCost}`, A.podcast.note],
            ["Targeted social ads", `$${A.social.costPerDayZone}/day per zone, $${A.social.costPerDayCity}/day city`, A.social.note],
            ["Co-branded drop", `$${A.collab.cost}`, A.collab.note],
          ]}
        />
        <p className="text-[14px]">
          The benchmark every plan is compared with spends the same budget as a team without taste data would: a pop-up at the busiest spot, street teams in the busiest areas, broad social ads. Same
          model, same city, same budget; only the taste data differs.
        </p>
      </Section>

      <Section id="evidence" kicker="4" title="Evidence: can comparables find a new launch's audience?">
        <p>
          A launch has no data of its own; Groundswell locates its audience from comparables. To test that, we take {cold?.targets.length ?? 12} established artists, brands and shows that are not
          probes, and in every city predict where each one&apos;s audience is from three Qloo-similar comparables alone, without looking at its own heatmap. The truth is its own Qloo heatmap. We count
          how many of its top 10% of cells each method finds; chance is 10%.
        </p>
        {idx ? (
          <>
            <div className="mt-4 rounded-2xl border border-line bg-panel p-4">
              <div className="mb-3 text-[13px] font-semibold">Where each taste is over-represented (its index): share of the true top 10% of cells found</div>
              <ul className="space-y-2">
                {order.map((m) => {
                  const b = idx[m]?.overlap;
                  if (!b) return null;
                  return (
                    <li key={m} className="grid grid-cols-[minmax(0,15rem)_1fr_6.5rem] items-center gap-3 text-[13px]">
                      <span className={m === "groundswell" ? "font-semibold text-text" : "text-muted"}>{METHOD_LABEL[m]}</span>
                      <div className="relative h-3 rounded-full bg-panel-3">
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full ${m === "groundswell" ? "bg-gradient-to-r from-glow to-hot" : "bg-[#5b6280]"}`}
                          style={{ width: `${(b.mean / maxBar) * 100}%` }}
                        />
                        <div className="absolute top-1/2 h-[3px] -translate-y-1/2 bg-text/50" style={{ left: `${(b.lo / maxBar) * 100}%`, width: `${((b.hi - b.lo) / maxBar) * 100}%` }} />
                      </div>
                      <span className="text-right font-mono">
                        {pct(b.mean, 1)} <span className="text-[11px] text-dim">±{((b.hi - b.lo) * 50).toFixed(1)}</span>
                      </span>
                    </li>
                  );
                })}
                <li className="grid grid-cols-[minmax(0,15rem)_1fr_6.5rem] items-center gap-3 text-[13px] text-dim">
                  <span>Chance</span>
                  <div className="relative h-3 rounded-full bg-panel-3">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-line-2" style={{ width: `${(0.1 / maxBar) * 100}%` }} />
                  </div>
                  <span className="text-right font-mono">10.0%</span>
                </li>
              </ul>
              <p className="mt-3 text-[12px] text-dim">
                {cold!.n} entity–city tests across {cold!.cities.length} cities; whiskers are 95% bootstrap intervals. Groundswell finds more than Claude alone in {cold!.versusClaude.wins} of{" "}
                {cold!.n}.{cold!.skipped.length ? ` ${cold!.skipped.length} tests skipped where Qloo's heatmap covered under 15% of a city.` : ""}
              </p>
            </div>
            <p>
              The control matters: it predicts from the correction alone (a cell&apos;s baseline, with no taste data), and finds {pct(idx.control?.overlap.mean, 1)}. So the result is not an artefact
              of measuring truth and prediction the same way; the comparables carry it. Without the correction, the same comparables find {pct(idx.compsRaw?.overlap.mean)}: raw heatmaps mostly say
              where people are.
            </p>
            <p>
              On raw volume the picture flips, and we report it: where people are finds {pct(vol?.people?.overlap.mean)} of the top cells by raw heatmap, because Qloo&apos;s raw heatmaps are densest
              wherever people are, for every taste. That is why the simulator uses both: population for volume, the index for where the taste is.
            </p>
          </>
        ) : (
          <p className="text-dim">
            Run <Code>npm run benchmark</Code> to produce the results.
          </p>
        )}
      </Section>

      <Section id="calibration" kicker="5" title="Calibration">
        <p>
          Word-of-mouth parameters were chosen by sweeping them over three launch scenarios with real comparables and venues (a show at Thalia Hall in Chicago, the Wiltern in Los Angeles and Brooklyn Steel in New York) and keeping a regime where an unpromoted launch stays
          near 3%, the benchmark roughly doubles it, and results are not knife-edge. At the chosen values:
        </p>
        {cal ? (
          <Table
            head={["Launch", "No promotion", "Benchmark", "Local seeding", "Media", "Mixed", "Optimiser"]}
            rows={cal.rows.map((r) => {
              const sc = cal.scenarios.find((s) => s.city === r.city);
              return [
                `${sc?.comps.join(" + ")} at ${r.venue ?? sc?.venue}`,
                pct(r.reach.none, 1),
                pct(r.reach.naive, 1),
                pct(r.reach.local, 1),
                pct(r.reach.media, 1),
                pct(r.reach.mixed, 1),
                pct(r.reach.optimizer, 1),
              ];
            })}
          />
        ) : null}
        <p>
          Geography changes what works. Seeding the hot neighbourhoods reaches about 13% in Chicago and New York, where those audiences are concentrated, but 7% in sprawling Los
          Angeles. Of the fixed strategies, media led in all three scenarios; a fixed mix trailed it by one to five points, and the optimiser came within three points everywhere and beat it in New York. The agents
          have to find the right mix for each launch.
        </p>
      </Section>

      <Section id="agents" kicker="6" title="The agents">
        <p>
          Everything on Claude (<Code>claude-opus-5-5</Code>, through the Anthropic SDK&apos;s tool runner and structured outputs). Six roles are agents, meaning they choose which tools to call and
          when to stop: the <strong>Director</strong>, whose tools are its teammates (profile the taste, map the audience, scout chosen zones, plan, simulate, critique, interview residents, map other
          cities, finalise); the <strong>Taste Analyst</strong> (search Qloo, check a comparable&apos;s coverage in the city, find similar entities, submit); the <strong>Scouts</strong> (search places
          in a zone, pick partners with a role, finish); the <strong>Strategist</strong> (test a variation in the simulator, submit plans); and, after the rehearsal, the{" "}
          <strong>Creative Director</strong> and the <strong>Field Analyst</strong> (below). Three roles are single structured calls: the <strong>Critic</strong>, <strong>Street Voices</strong> and
          the <strong>Producer</strong>. The <strong>Cartographer</strong> is a Qloo mapping tool and the <strong>Simulator</strong> is the engine; neither is a model.
        </p>
        <p>
          The Director decides the order, retries what fails (for example replacing comparables Qloo can&apos;t resolve), chooses which zones to scout and when a plan is good enough. A live rehearsal
          has a time budget: after 165 seconds the Director is told to wrap up, and street interviews are skipped after 215, so a run fits within the hosting limit of 300 seconds.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Rules live in the tools, not just prompts: plans may only use what the scouts found, must fit the budget, can&apos;t stack more collabs, podcasts or pop-ups than a real team would run, and
            need two rounds of plan, simulate and critique before they ship.
          </li>
          <li>
            Partners are filtered: no schools, places of worship, clinics, government buildings, gun or cannabis shops; no bars for all-ages or no-alcohol briefs; no children&apos;s places unless the
            launch is all ages; never the launch&apos;s own venue.
          </li>
          <li>Agents talk about results as reach of the natural audience and cost per point of reach, never head-counts: the simulation&apos;s population scale is arbitrary.</li>
          <li>Every Qloo request behind a run is in its feed. Showcase rehearsals are real runs, recorded with every event, so they replay exactly.</li>
        </ul>
      </Section>

      <Section id="kit" kicker="7" title="Launch kit and mission control">
        <p>
          <strong>The launch kit.</strong> The Creative Director writes copy for each neighbourhood in the winning plan: a poster headline, an Instagram caption, a TikTok or Reels hook, a post for X
          or Threads, a podcast host-read and an email to each partner. Before it may use a cultural reference in a neighbourhood&apos;s copy, it checks it on Qloo for that neighbourhood (one search
          and one heatmap; the reference&apos;s fit index averaged over the neighbourhood&apos;s cells: strong at 0.6 or more, mixed at 0.42 or more, else weak). Its submit tool rejects references it
          didn&apos;t check or that came back weak, copy without its link, and claims such as &ldquo;sold out&rdquo; or &ldquo;award-winning&rdquo;. Code then builds the rest: a poster per partner
          with its own QR code, a tracked link per poster, post, email and podcast read, an ad-targeting brief per neighbourhood (centre, radius, interests and age band from Qloo, dates and budget
          from the plan; to set up by hand in an ads manager), and a calendar file.
        </p>
        <p>
          <strong>Mission control.</strong> Each tracked link records a scan (link code, time, a coarse country from the hosting platform, and nothing else about the person) and forwards to the ticket
          link or the launch page. Each neighbourhood is expected to bring scans in proportion to its share of the natural audience; mission control calls it ahead or behind when the gap is at least
          two standard errors, and too early before 30 scans. For demos, &ldquo;simulate a week&rdquo; adds scans drawn around that expectation with one neighbourhood set to fall short and one to beat
          it; they are stored and shown as simulated.
        </p>
        <p>
          <strong>The Field Analyst</strong> reads those numbers and re-plans the budget not yet spent (actions that haven&apos;t started count in full, running ones by the share of their days still
          to come). It can search Qloo for new partner places near a neighbourhood that is behind. Its submit tool rejects moves larger than what an action has left, partners it didn&apos;t find on
          Qloo, and moves above a tenth of the remaining budget while every neighbourhood is still too early to call. Scans per dollar assume the next dollar performs like the average one so far; it
          says so.
        </p>
      </Section>

      <Section id="qloo" kicker="8" title="Qloo, end to end">
        <Table
          head={["Qloo request", "Used for"]}
          rows={[
            ["/v2/insights · filter.type=urn:heatmap, filter.location (point + radius)", "The atlas (54 probes × 7 cities), each launch's fit, brand-collab reach, the benchmark"],
            ["/v2/insights · urn:heatmap with output.heatmap.boundary=urn:entity:locality", "Neighbourhood names and boundaries"],
            ["/v2/insights · filter.type=urn:entity:place, filter.location, feature.explainability", "Partner places near each hot zone, and which comparable pulled each in"],
            ["/v2/insights · urn:entity:podcast, urn:entity:brand (signal.location.query)", "Podcasts and local brand partners this audience over-indexes on"],
            ["/v2/insights · urn:demographics, urn:audience, urn:tag", "Who the comparables' fans are: age skew, audience segments, tags"],
            ["/v2/insights · urn:heatmap for one reference, averaged over a neighbourhood's cells", "The Creative Director's check before a cultural reference goes into that neighbourhood's copy"],
            ["/v2/insights · urn:entity:place near a neighbourhood, signals from the comparables", "The Field Analyst's search for new partner places where scans are behind"],
            ["/search", "Resolving comparables, venues, probes and the kit's references, with a name check"],
          ]}
        />
      </Section>

      <Section id="limits" kicker="9" title="What this does not tell you">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>It is a simulation, not a forecast. Reach is relative to the model&apos;s natural audience; it does not predict ticket sales.</li>
          <li>Action effects and costs are stated assumptions, not measurements from campaigns. They are on this page and in one file of the code.</li>
          <li>Population is approximated from Qloo activity with a floor; census data would be better where it exists.</li>
          <li>
            Qloo results describe aggregate taste, not individuals, and Groundswell sends no personal data to Qloo. The server keeps visitors&apos; IP addresses in memory for up to 30 minutes for rate
            limiting. A tracked-link scan stores its link code, time, a coarse country and whether it was simulated; nothing else about the person.
          </li>
          <li>Mission control&apos;s expectation is the rehearsal&apos;s model, not ground truth, and its simulated scans are a demonstration, not data.</li>
          <li>Street voices are written by Claude from each area&apos;s Qloo signature and nearby places. They are labelled as simulated and are not real people.</li>
          <li>The benchmark tests where an audience is, not whether a plan sells tickets; that needs real campaign outcomes.</li>
        </ul>
      </Section>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link href="/" className="rounded-full bg-text px-4 py-2 font-semibold text-ink hover:bg-glow">
          Rehearse a launch
        </Link>
        <Link href="/atlas" className="rounded-full border border-line px-4 py-2 hover:border-text">
          Explore the Taste Atlas
        </Link>
      </div>
    </main>
  );
}

function Section({ id, kicker, title, children }: { id: string; kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-14 scroll-mt-20 space-y-3 text-[15.5px] leading-relaxed text-text/90">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[13px] text-glow">{kicker.padStart(2, "0")}</span>
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-panel-3 px-1.5 py-0.5 font-mono text-[0.85em] text-cool">{children}</code>;
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="my-3 overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-panel-2 text-[11px] uppercase tracking-wider text-dim">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-2 align-top ${j === 0 ? "text-text" : "text-muted"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
