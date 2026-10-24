<p align="center">
  <img src="docs/brand/mark.svg" alt="" width="72" />
</p>

<h1 align="center">Groundswell</h1>

<p align="center"><strong>A flight simulator for culture.</strong><br />
Rehearse a launch in a living model of a real city, built from Qloo's taste graph. Then launch it with a kit made for each neighbourhood, and steer it from what people actually scan.</p>

<p align="center">
  <a href="#run-it-locally"><b>Run it locally</b></a> ·
  <a href="#evidence">Evidence</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="docs/CLAIMS.md">Every claim, with its evidence</a> ·
  <a href="#use-it-from-an-agent-mcp">MCP</a>
</p>

---

## For judges: the short version

| Criterion | What to look at | Where it lives |
|---|---|---|
| **Qloo, used deeply** | Qloo heatmaps of 54 probe entities become a taste model of 7 cities (10,636 neighbourhood cells, taste districts, cross-city twins). Every launch is mapped, scouted, simulated, written and re-planned from Qloo: heatmaps, places with explainability, podcasts, brands, demographics, audiences, tags and search. | [`src/lib/qloo/`](src/lib/qloo), [Qloo, end to end](#qloo-end-to-end) |
| **Agentic** | Six Claude agents that choose their own tools: a Director whose tools are its teammates, a Taste Analyst, Scouts, a Strategist that tests variations in a simulator, a Creative Director that checks references on Qloo before writing, and a Field Analyst that re-plans from tracked scans. Rules live in the tools. | [`src/lib/agents/`](src/lib/agents), [`src/lib/kit/director.ts`](src/lib/kit/director.ts), [`src/lib/campaign/analyst.ts`](src/lib/campaign/analyst.ts) |
| **Evidence** | From comparables alone, Groundswell finds **44.8%** of the neighbourhoods where a held-out taste is over-represented, against **23.7%** for Claude alone, **22.0%** for "where people are" and **10%** for chance (77 tests, 7 cities, 95% interval 40.0–49.8%). | [Evidence](#evidence), [`data/benchmark/coldstart.json`](data/benchmark/coldstart.json) |
| **A product, end to end** | Brief → live rehearsal → plan → launch kit (copy per neighbourhood, posters with tracked QR codes, emails, scripts, ad brief, calendar, one zip) → launch page → mission control → Field Analyst re-plan. Live runs are saved and shareable. Copy is written in the city's language, with English alongside in Tokyo and Mexico City. | [What it does](#what-it-does) |
| **Honesty** | Every showcase launch is fictional and says so; simulated scans and simulated residents are labelled; the case where Groundswell loses is reported next to the case where it wins; every number below maps to a file in [`docs/CLAIMS.md`](docs/CLAIMS.md). | [Limits](#limits) |

## What it does

**1. Rehearse.** Describe a launch in a sentence and pick a city: "Marisol Vega, a Latin R&B singer in the vein of Omar Apollo and Kali Uchis, plays her first headline show at Thalia Hall in Pilsen, six weeks from now. 21+. $12,000." Then watch the team work on a 3D map of the city:

- The **Taste Analyst** chooses comparables Qloo covers well in that city and profiles their fans.
- The **Cartographer** maps where that taste is over-represented, corrected for where Qloo simply has more data, with distance to the venue.
- The **Scouts** pick real partner places in each hot zone, each with a role (poster spot, ticket outlet, pop-up host, street-team base, cross-promotion), plus the podcasts and brands the audience over-indexes on.
- The **Strategist** designs plans and tests variations in the simulator before committing; the **Simulator** rehearses each plan 48 times through a model of word of mouth, against a benchmark that spends the same budget where people are.
- The **Critic** sends changes back, and the team runs a second round.
- **Street Voices** (simulated residents, labelled as such) react, and the **Producer** writes the week-by-week plan.
- The **Director** runs all of it: it decides the order, retries what fails and decides when a plan is good enough.

You get the plan with real addresses, its simulated reach with a bad-case band, the benchmark it beat, a what-if panel that re-runs the simulation in your browser, and where the same taste is strongest in the other six cities.

**2. Launch.** The **Creative Director** writes copy for each neighbourhood in the plan: a poster headline, an Instagram caption, a TikTok or Reels hook, an X or Threads post, a podcast host-read and an outreach email to each partner. Before it may use a cultural reference in a neighbourhood's copy, it checks that reference on Qloo for that neighbourhood; its submit tool rejects references that are weak there, claims like "sold out", and assumptions about a partner's premises. Code builds the rest: a poster per partner with its own QR code, a tracked link for every poster, post, email and podcast read, a launch page, an ad-targeting brief per neighbourhood, a calendar file, and one zip with everything.

**3. Steer.** Every tracked link records a scan and forwards to the ticket link. **Mission control** maps scans per neighbourhood against what the rehearsal expected and calls each one ahead, behind or too early, with a stated statistical rule. The **Field Analyst** reads that, searches Qloo for new partner places where a neighbourhood is behind, and moves the budget not yet spent; its moves are checked against what each action has left. For demos, "simulate a week" adds labelled synthetic scans; scanning a poster's QR code with a phone adds a real one.

## Recorded rehearsals

Real runs of the full team, recorded with every event so they replay exactly, each with its launch kit. **The launches are fictional** (the singer, the comedy night, the supporters' group, the café, the film, the start-up and the rapper are invented); the cities, venues, comparables and Qloo data are real.

<!-- SHOWCASES -->
| Launch | City | Plan's reach | Same budget, no taste data | Rounds | Qloo requests |
|---|---|---|---|---|---|
| **A first headline show**: Marisol Vega, a new Latin R&B singer, aims to sell out Thalia Hall (about 800 standing). | Chicago | **19.5%** (3.1×) | 6.2% | 2 | 48 |
| **A clean comedy night**: Clean Slate, a family-friendly stand-up night at the Tabernacle. | Atlanta | **10.3%** (2.4×) | 4.3% | 2 | 53 |
| **A supporters' match night**: Big-screen match nights for Chelsea fans, run by an independent supporters' group. | London | **25.8%** (3.2×) | 8.1% | 2 | 56 |
| **A baseball café in Tokyo**: Sixty Feet Six, a two-week baseball café and viewing-party pop-up. | Tokyo | **19.9%** (3.3×) | 6.0% | 2 | 27 |
| **Indie film previews**: Tidewater, an independent coming-of-age film, previews at Nitehawk Williamsburg. | New York | **16.4%** (4.0×) | 4.1% | 2 | 44 |
| **A startup's first store**: Tierra, a sustainable sneaker start-up, opens a pop-up in Roma Norte. | Mexico City | **18.5%** (2.3×) | 7.9% | 2 | 46 |
| **An album release show**: K. Rivers, a West Coast rapper, throws a release show at the Wiltern. | Los Angeles | **18.3%** (4.6×) | 4.0% | 2 | 47 |

Reach is the share of the city's natural audience (people whose taste fits the launch, weighted by distance to the venue) reached by launch day in the simulation.
<!-- /SHOWCASES -->

Across the seven, the final plans reach 2.3–4.6× more of the natural audience than the same budget spent where people are. Each run took 149–195 seconds, 24–29 Claude calls and 27–56 Qloo requests.

## Evidence

**Can comparables find a new launch's audience?** Everything rests on this: a launch has no data of its own, so Groundswell locates its audience from comparables. For 12 established artists, brands and shows that are not atlas probes, in each of 7 cities, we predict where each one's audience is over-represented from three Qloo-similar comparables alone, never looking at its own heatmap. The truth is its own Qloo heatmap; we count how many of its top 10% of cells each method finds.

| Method | Over-representation (index) | Raw volume |
|---|---|---|
| **Groundswell** (comparables, density-corrected index) | **44.8%** (40.0–49.8) | 21.4% |
| The same comparables, raw heatmap | 28.0% | 76.2% |
| Claude alone, naming neighbourhoods with coordinates | 23.7% | 62.5% |
| Where people are (activity, no taste) | 22.0% | 82.5% |
| Control: the density correction alone | 0.5% | 0.0% |
| Chance | 10.0% | 10.0% |

- Groundswell is ahead in every city (36–56%) and beats Claude alone in 65 of 77 tests. 7 tests were skipped where Qloo's heatmap covered under 15% of the city.
- The control finds 0.5%, so the result is not an artefact of measuring truth and prediction the same way; the comparables carry it.
- On raw volume, "where people are" wins: Qloo's raw heatmaps are densest wherever people are, for every taste. That is why the simulator multiplies population (volume) by the index (where the taste is).
- Reproduce: `npm run benchmark`. Results: [`data/benchmark/coldstart.json`](data/benchmark/coldstart.json).

**Calibration.** Word-of-mouth parameters were chosen by sweeping them over three launch scenarios with real comparables and venues (Thalia Hall in Chicago, the Wiltern in Los Angeles, Brooklyn Steel in New York), keeping a regime where an unpromoted launch reaches about 3%, the benchmark roughly doubles it, and results are not knife-edge (`npm run calibrate`, results in [`data/benchmark/calibration.json`](data/benchmark/calibration.json)). Geography changes what works: seeding the hot neighbourhoods reaches about 13% in Chicago and New York but 7% in sprawling Los Angeles.

**Tests.** 70 unit tests: the simulator, the atlas build, the benchmark metrics, fit, zones, partner filters, action costs, tracked links, the scan report's statistical rule, the budget clock, the scan simulator, and the kit's CSV and calendar files (`npm test`). CI runs lint, typecheck, tests and a production build.

## How it works

```mermaid
flowchart LR
  subgraph Atlas["Taste Atlas (built once per city)"]
    P[54 probe heatmaps<br/>Qloo urn:heatmap] --> G[~1 km grid<br/>fingerprints]
    G --> D[taste districts<br/>k-means, named by Claude]
    G --> T[weak ties<br/>similar taste, ≥3 km apart]
  end
  subgraph Run["Rehearse"]
    B[brief] --> S[spec<br/>Claude, structured]
    S --> DIR{Director agent}
    DIR --> AN[Taste Analyst agent<br/>search, coverage, similar]
    DIR --> CA[Cartographer tool<br/>heatmap → index fit, venue decay]
    DIR --> SC[Scouts agent<br/>places, roles; podcasts, brands]
    DIR --> ST[Strategist agent<br/>tests variations in the simulator]
    DIR --> SI[Simulator<br/>48 runs, benchmark]
    DIR --> CR[Critic]
    DIR --> VO[Street Voices]
    DIR --> PR[Producer → plan]
  end
  subgraph Launch["Launch and steer"]
    PR --> CD[Creative Director agent<br/>checks references on Qloo]
    CD --> K[kit: posters + QR, links,<br/>emails, scripts, ad brief, calendar]
    K --> SCAN[tracked scans]
    SCAN --> MC[mission control<br/>observed vs expected]
    MC --> FA[Field Analyst agent<br/>Qloo places, re-plan]
  end
  Atlas --> CA
  T --> SI
  SI --> CR --> ST
```

### The city model

For each city, Qloo's heatmap (`filter.type=urn:heatmap`, a point and radius) is pulled for 54 probes: artists, TV shows, brands, games, podcasts and athletes. Cells present for at least eight probes form the grid. Each cell's fingerprint is its within-city percentile for every probe, corrected for how many probes Qloo returns there (busy downtown cells appear for everything), clipped, coverage-weighted and centred. Cells cluster into 5–7 taste districts, named by Claude from the signature only. Each cell is tied to its four most taste-similar cells at least 3 km away: weak ties that carry word of mouth across town. Taste twins compare districts across cities. Building one city takes 108 Qloo requests.

### Where a launch lands

A cell's fit is its percentile for the comparables minus its baseline (what it shows for everything), re-ranked: an index of where the taste is over-represented. Population is a floor plus damped Qloo activity. With a venue, people are weighted by `exp(−distance / 7 km)` (Huff's distance decay). Natural audience = population × 0.25 × fit³ × travel.

### The simulation

[`packages/sim`](packages/sim) is a standalone package: a stochastic, spatial Bass diffusion with complex contagion.

```
h = baseRate + Σ promotion reaching the cell today + wom × exposure^k
```

Exposure is the share of the cell's social neighbourhood (itself, adjacent cells, weak ties) currently talking about the launch; talk fades with a 6-day half-life; k = 1.5 makes clustered buzz spread where thin awareness fizzles (Centola & Macy 2007). Counts are binomial draws; each plan runs 48 times for a mean and a 10th–90th percentile band (96 times for the final plan). Every adopter is credited to an action, word of mouth or organic discovery.

Action effects and costs are stated assumptions in one file ([`src/lib/launch/actions.ts`](src/lib/launch/actions.ts)) and on the method page.

### The team

All on Claude (`claude-opus-5-5`) through the Anthropic SDK (tool runner, structured outputs, server-side refusal fallback). "Agent" here means the model chooses which tools to call and when to stop.

| Role | Kind | Tools | Code |
|---|---|---|---|
| Director | Agent | `profile_taste`, `map_audience`, `scout`, `plan`, `simulate`, `critique`, `interview`, `scout_expansion`, `finalize` | [`agents/director.ts`](src/lib/agents/director.ts) |
| Taste Analyst | Agent | `search`, `check_city`, `similar`, `submit` | [`agents/analyst.ts`](src/lib/agents/analyst.ts) |
| Scouts | Agent | `places`, `pick`, `finish` | [`agents/scouts.ts`](src/lib/agents/scouts.ts) |
| Strategist | Agent | `estimate` (tests a variation in the simulator), `submit_plans` | [`agents/strategist.ts`](src/lib/agents/strategist.ts) |
| Creative Director | Agent | `check_reference` (Qloo search + heatmap over a neighbourhood), `submit_kit` | [`kit/director.ts`](src/lib/kit/director.ts) |
| Field Analyst | Agent | `find_places` (Qloo places near a neighbourhood), `submit_replan` | [`campaign/analyst.ts`](src/lib/campaign/analyst.ts) |
| Critic, Street Voices, Producer | Single structured calls | none | [`agents/`](src/lib/agents) |
| Cartographer | Tool (Qloo heatmap → fit map) | | [`launch/fit.ts`](src/lib/launch/fit.ts) |
| Simulator | Engine | | [`packages/sim`](packages/sim) |

Guardrails live in the tools. Plans use only scouted menu items, stay within budget, can't stack more collabs, podcasts or pop-ups than a real team would run, and `finalize` refuses before two rounds of plan → simulate → critique. Partners never include schools, places of worship, clinics, government buildings, gun or cannabis shops, or the launch's own venue; no bars for all-ages or no-alcohol briefs; no children's places unless the launch is all ages. The Creative Director's `submit_kit` rejects unchecked or weak references, copy without its tracked link, claims like "sold out" or "award-winning", and assumptions about a partner's premises. The Field Analyst's `submit_replan` rejects moves larger than an action has left, partners it didn't find on Qloo, and big moves while the data are too thin to call. Agents report reach and cost per point of reach, never head-counts (the simulation's population scale is arbitrary). A live rehearsal has a time budget (wrap up at 165 s, skip interviews after 215 s) so it fits the 300 s hosting limit.

### Qloo, end to end

| Qloo request | Used for |
|---|---|
| `/v2/insights` `filter.type=urn:heatmap`, `filter.location` (WKT point + radius) | The atlas (54 probes × 7 cities), each launch's fit, brand-collab reach, the benchmark, the Creative Director's reference checks |
| `/v2/insights` `urn:heatmap` + `output.heatmap.boundary=urn:entity:locality` | Neighbourhood names and boundaries |
| `/v2/insights` `urn:entity:place`, `filter.location`, `feature.explainability` | Partner places in each hot zone and which comparable pulled each in; the Field Analyst's new partners |
| `/v2/insights` `urn:entity:podcast`, `urn:entity:brand` (+ `signal.location.query`) | Podcasts and local brands the audience over-indexes on |
| `/v2/insights` `urn:demographics`, `urn:audience`, `urn:tag` | Who the comparables' fans are: age skew (also the ad brief's age band), audience segments, tags |
| `/search` (+ `filter.location` for venues) | Resolving comparables, venues, probes and the kit's references, with a name check |

The Qloo client ([`src/lib/qloo/client.ts`](src/lib/qloo/client.ts)) whitelists parameters (Qloo silently ignores unknown ones), paces requests under the key's rate limit, retries with `Retry-After`, shares identical in-flight requests and caches responses. Every request a run makes is listed in its feed.

## Tech stack

| Layer | Choice |
|---|---|
| App | Next.js 15.5 (App Router), React 19.1, TypeScript, Tailwind CSS 4 |
| Map | deck.gl 9.4 on MapLibre GL 6 with OpenFreeMap tiles |
| Simulation | `@groundswell/sim` (this repo, no dependencies) |
| Agents | Anthropic Claude `claude-opus-5-5`, `@anthropic-ai/sdk` tool runner and structured outputs |
| Taste data | Qloo Taste AI API (hackathon host) |
| Launch kit | `next/og` posters with bundled Bricolage Grotesque and Inter (SIL Open Font License; Noto Sans JP from Google Fonts for Japanese), `qrcode`, `jszip` |
| Storage | Postgres through `@neondatabase/serverless` when `DATABASE_URL` is set; memory otherwise |
| Agents' protocol | Model Context Protocol server, `@modelcontextprotocol/sdk` |
| Tests and CI | Vitest, GitHub Actions |

## Project structure

```text
groundswell/
├── packages/sim/              # the simulation engine (spatial Bass diffusion, Monte Carlo, optimiser)
├── src/
│   ├── app/                   # pages: home, rehearse/[id], rehearse/live, campaign/[id], l/[id], atlas, method; api routes
│   ├── components/            # city map, war room, plan sheet, launch kit, mission control, atlas explorer, home
│   └── lib/
│       ├── qloo/              # Qloo client, parameter whitelist, typed operations
│       ├── atlas/             # cities, probes, atlas build, districts, twins
│       ├── launch/            # spec, taste, fit, scouting, actions, simulation wrapper, venue, expansion
│       ├── agents/            # Director, Taste Analyst, Scouts, Strategist, Critic, Voices, Producer, orchestration
│       ├── kit/               # Creative Director, tracked links, ad brief, calendar, labels per language
│       ├── campaign/          # scan report, budget clock, scan simulator, Field Analyst
│       ├── store.ts           # campaigns, scans, re-plans, saved runs (Postgres or memory)
│       └── bench/             # cold-start benchmark metrics
├── scripts/                   # build-atlas, record-showcases, record-kits, benchmark, calibrate, launch
└── data/                      # built atlases, recorded rehearsals and kits, benchmark results, poster fonts
```

## HTTP API

| Route | Purpose |
|---|---|
| `POST /api/rehearse` (server-sent events) | A live rehearsal: `{brief, cityId, budget?, days?, launchUrl?}`; saved at the end as `/rehearse/run-…` |
| `POST /api/kit` (server-sent events), `GET /api/kit/:id` | Produce or fetch a campaign's launch kit |
| `GET /api/poster?d=…` | A poster PNG with its QR code |
| `GET /go/:campaign/:code` | A tracked link: records the scan, forwards to the ticket link or launch page |
| `GET /api/campaign/:id`, `POST`/`DELETE /api/campaign/:id/simulate`, `POST /api/campaign/:id/analyst` | Mission control: scans and the latest re-plan, simulated weeks, the Field Analyst |
| `GET /api/showcase/:id`, `GET /api/atlas/:city`, `GET /api/twins` | Recorded rehearsals, city atlases, taste twins |
| `/api/mcp` | MCP server |

Rate limits per IP per half hour: 4 live rehearsals, 6 launch kits, 6 Field Analyst runs.

## Use it from an agent (MCP)

Streamable HTTP at `<origin>/api/mcp`. For example, in Claude Code: `claude mcp add --transport http groundswell <origin>/api/mcp`.

Tools: `list_cities`, `taste_twins`, `map_launch_audience`, `scout_launch_partners`, `rehearse_launch` (returns the plan and a link to watch the saved rehearsal and produce its kit), `get_recorded_rehearsal`. Try `npm run mcp:smoke` against a running server.

## Run it locally

You need Node.js 22.9 or newer, a Qloo hackathon API key and an Anthropic API key.

```bash
git clone https://github.com/TusharTechs/groundswell
cd groundswell
npm install                     # also copies MapLibre's worker into public/
cp .env.example .env            # add QLOO_API_KEY and ANTHROPIC_API_KEY (DATABASE_URL optional)
npm run dev                     # http://localhost:3000
```

The built atlases, recorded rehearsals and kits, and benchmark results are in `data/`, so the app works straight away. Without `DATABASE_URL`, campaigns, scans and saved runs live in memory (mirrored to `.data/` in development). To rebuild from Qloo with your own key:

| Command | What it does | Cost |
|---|---|---|
| `npm run atlas` | Rebuild all city atlases (or `npm run atlas -- chicago`) | 108 Qloo requests and 1 Claude call per city |
| `npm run record` | Record the showcase rehearsals (or `npm run record -- chicago-headline`) | 27–56 Qloo requests and 24–29 Claude calls each |
| `npm run record:kits` | Produce the showcase launch kits | a few Qloo requests and Claude calls each |
| `npm run benchmark` | The cold-start test | about 350 Qloo requests and 85 Claude calls the first time; cached after |
| `npm run calibrate` | Calibration summary (`-- --sweep` for the sweep) | about 45 Qloo requests the first time |
| `npm run launch -- --city chicago "brief…"` | One rehearsal in the terminal | as `record` |
| `npm run mcp:smoke -- http://localhost:3000` | Call the MCP server like an agent would | none |
| `npm test`, `npm run lint`, `npm run typecheck` | Checks | none |

Scripts cache raw Qloo responses under `.cache/` (git-ignored), so reruns cost no quota.

## Data and privacy

- No personal data is sent to Qloo: only entity names, tags and the locations of cities, neighbourhoods and venues.
- No accounts. Briefs go to Anthropic (Claude). A finished live rehearsal is saved (its brief and events) so its link works; a launch kit is saved so its links work.
- The server keeps visitors' IP addresses in memory for up to 30 minutes for rate limiting. A tracked-link scan stores its link code, time, a coarse country from the hosting platform and whether it was simulated; nothing else about the person.
- `data/` holds derived results (quantized within-city percentiles, district summaries, recorded runs and kits); raw Qloo responses are never committed.
- Qloo results describe aggregate taste. District names and copy are written with rules against describing people by ethnicity, religion, income, health or politics. Street voices are simulated and labelled.

## Limits

- It is a simulation, not a forecast. Reach is relative to the model's natural audience; it does not predict ticket sales.
- Action effects and costs are stated assumptions, not measured from campaigns.
- Population is approximated from Qloo activity with a floor.
- The benchmark tests where an audience is, not whether a plan sells tickets; that needs real campaign outcomes, which mission control is built to collect.
- Mission control's expectation is the rehearsal's model, not ground truth; its simulated scans are a demonstration, not data. The ad-targeting file is a brief to set up by hand, not an upload format for any ads platform.

## AI disclosure

Built with Claude Code (Claude Opus 5.5), which researched the Qloo API and the hackathon, wrote the code, tests, scripts and documentation, and ran the calibration and benchmark experiments, directed by the author. Inside the product, Claude runs the agents, parses briefs, names districts, writes the launch kit's copy and the simulated street voices; every taste number comes from Qloo.

## License

[MIT](LICENSE)
