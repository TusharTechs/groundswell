# Groundswell: Devpost submission draft

> Paste each section into the matching Devpost field. Replace `<LIVE_URL>` and `<REPO_URL>` once deployed. The AI disclosure is yours to confirm.

## Project name

Groundswell

## Elevator pitch (≤ 200 characters)

A flight simulator for culture: nine AI agents rehearse your launch in a living, Qloo-built model of a real city, hundreds of times, and hand you the plan that worked.

## Inspiration

Every week, thousands of things launch into cities: a band's first headline show, a comedy night, a restaurant, a pop-up, a film's preview week. Most are planned on instinct. Where do we put posters? Which neighbourhood do we start in? Which podcast? Big companies run research for that; the comedian, the indie promoter and the taqueria owner guess.

Pilots don't learn on real planes. They rehearse in a simulator that is faithful enough to the world that what works there works outside. We wanted that for culture: a model of a real city faithful to what its neighbourhoods actually love, and a team that rehearses a launch inside it before anyone spends a dollar.

Qloo made it possible. Its taste graph knows, at street level, where the people who love a given artist, show or brand live and go.

## What it does

You describe a launch in a sentence and pick a city. Nine Claude agents take it from there, and you watch them work on a live 3D map:

- **Taste Analyst** finds the launch's comparables on Qloo and who their fans are (age skew, audience segments).
- **Cartographer** maps where in the city that taste lives, at about 1 km resolution, corrected for where Qloo simply has more data, and finds the venue so distance counts.
- **Scouts** find real partner places in each hot zone, with addresses and the comparable that pulled each in (Qloo explainability), plus the podcasts and brands this audience over-indexes on.
- **Strategist** designs three different bets and tests variations in the simulator before committing.
- **Simulator** rehearses each plan 48 times through a model of word of mouth spreading between neighbourhoods, against a benchmark that spends the same budget where people are, with no taste data.
- **Critic** reads the results and sends concrete changes back; the Strategist revises; the Simulator runs again.
- **Street Voices**: simulated residents of the hot zones, grounded in their area's Qloo taste signature, react to the plan (labelled as simulated).
- **Producer** writes the plan: week by week, place by place, with simulated reach, a bad-case band, risks and what to measure.
- **Director** runs the team: it decides the order, retries what fails, chooses where to scout, and decides when a plan is good enough.

Then you can **try a change**: switch any action off or add one from the scouts' menu, and the simulation re-runs 48 times in your browser while the map replays the campaign.

Around it:

- **Taste Atlas**: seven cities (Chicago, New York, Los Angeles, Atlanta, London, Mexico City, Tokyo) mapped by what their neighbourhoods love, with taste districts and each district's taste twin in the other cities.
- **Seven recorded rehearsals**, one per city, open instantly.
- **An MCP server** so any AI agent can map an audience, scout partners, find taste twins or run a full rehearsal.

## How we built it

**The city model.** For each city we pull Qloo heatmaps (`filter.type=urn:heatmap` with a point and radius) for 54 probe entities that span taste and exist everywhere: artists, series, brands, games, podcasts, athletes. That gives about 10,600 neighbourhood cells, each with a taste fingerprint. Qloo returns a cell only where it has data, so busy downtown cells appear for everything; we correct each probe for that data density before clustering cells into taste districts (named by Claude from the signature only) and linking each cell to its most taste-similar cells across town.

**Where a launch lands.** A cell's fit is its percentile for the launch's comparables minus what it shows for everything: an index of where the taste is over-represented. Population comes separately, and a venue adds distance decay (Huff's gravity model).

**The simulation.** `@groundswell/sim`, a dependency-free package in the repo: a stochastic, spatial Bass diffusion with complex contagion (people take up culture when several around them have), fading buzz, binomial draws and Monte Carlo bands. Every adopter is credited to an action, word of mouth or organic discovery. It runs on the server for the agents and in the browser for what-if.

**The agents.** Claude Opus 5.5 through the Anthropic SDK's tool runner and structured outputs. The Director's tools are its teammates; the Strategist's tools are the simulator and a submit tool. Rules live in the tools: plans may only use what the scouts found, must fit the budget, can't stack unrealistic numbers of podcasts or pop-ups, and need two rounds of plan → simulate → critique before they ship. Partners exclude schools, places of worship, clinics, gun and cannabis shops, and bars for all-ages briefs.

**The app.** Next.js 15 and React 19, deck.gl on MapLibre for the 3D city, server-sent events streaming every agent step and every Qloo request.

## Evidence (how we know the core idea works)

A launch has no data of its own; everything rests on finding its audience from comparables. So we tested exactly that. For 12 established artists, brands and shows (not probes) in each of 7 cities, we predicted where each one is most over-represented from three Qloo-similar comparables alone, without looking at its own heatmap, then compared with its real Qloo heatmap.

| Method | Share of the true top 10% of neighbourhoods found |
|---|---|
| **Groundswell** | **44.8%** (95% CI 40.0–49.8) |
| Claude alone, naming neighbourhoods | 23.7% |
| Going where people are | 22.0% |
| Chance | 10% |

Groundswell beats Claude alone in 65 of 77 tests and leads in every city. A control that uses only our density correction finds 0.5%, so the result comes from the comparables, not from how we measured. We also report where it loses: on raw volume, "where people are" wins, because Qloo's raw heatmaps are densest wherever people are; that's why the simulator multiplies population by the index.

In the seven recorded rehearsals, the team's final plans reach roughly 3–4× more of the natural audience than the same budget spent where people are.

## Challenges we ran into

- **Qloo's heatmaps are densest where Qloo has the most data.** Our first city model labelled downtown Manhattan "country music" because niche probes only appear in busy cells. Correcting each probe for data density, and clustering only on probes that cover most of a city, fixed it; the same insight became the fit index the benchmark validates.
- **Our first simulation was knife-edge.** Word of mouth either fizzled or swallowed the city, and a podcast reached 60% of a city in a day. We added fading buzz and complex contagion, recalibrated every channel to realistic per-day conversion, swept the parameters over three real launches, and chose a regime that isn't knife-edge.
- **A biased population proxy.** Using Qloo activity as population put Kendrick Lamar's LA audience in West Hollywood instead of South LA. A population floor and the density-corrected fit fixed it.
- **Honesty about numbers.** The simulation's population scale is arbitrary, so the agents report reach of the natural audience and cost per point of reach, never head-counts or tickets.
- **Time.** A full rehearsal must finish inside a serverless function's limit, so the Director has a time budget and the Strategist batches its simulator tests.

## Accomplishments we're proud of

- A validated core: comparables plus our correction find twice as many of a taste's top neighbourhoods as Claude alone or going where people are, with a control that rules out a measurement artefact.
- Agents that genuinely plan against a model of the world: the Strategist tests ideas in the simulator; the Director decides what to do next; the Critic changes the plan between rounds.
- Seven cities on three continents, built entirely from Qloo.
- An honest product: stated assumptions on one page, the case where we lose reported next to the case where we win, simulated residents labelled as simulated.

## What we learned

- Qloo's heatmaps carry two signals at once: where people are and where a taste is over-represented. Separating them is what makes the second useful.
- The right launch strategy depends on the geography of taste. A concentrated audience rewards seeding its neighbourhoods; a sprawling one rewards media. The agents have to find which for each launch.
- Agents get much better when they can test ideas against a model instead of only reasoning about them.

## What's next

- **Closing the loop with real outcomes:** ticket and footfall data from promoters and venues to calibrate each channel's effect per city.
- **More cities**, built on demand with the same pipeline.
- **Census population** where it exists, in place of the activity-based proxy.
- **Integrations** where launches are planned: ticketing platforms, venue booking tools, agency workflows (the MCP server is the first step).

## The business (for the Calacanis bonus)

Every live event, store opening and product drop is a local launch, and the people running most of them have no research team. Groundswell sells the rehearsal: per-launch plans for independent promoters, venues, artist managers, restaurateurs and comedians; seats for agencies and brand teams; and API and MCP access for ticketing and event platforms that want a plan generated with every listing. The atlas compounds: every city added and every real outcome fed back makes the next rehearsal more faithful.

## Built with

Qloo Taste AI API, Anthropic Claude (claude-opus-5-5), Anthropic SDK tool runner, Model Context Protocol, Next.js, React, TypeScript, deck.gl, MapLibre GL, OpenFreeMap, Tailwind CSS, Zod, Vitest, GitHub Actions, Vercel.

## Try it out

- Live demo: `<LIVE_URL>` (no sign-in; recorded rehearsals open instantly, live rehearsals take about three minutes)
- Repository: `<REPO_URL>`

## AI disclosure

Groundswell was built with Claude Code (Claude Opus 5.5), which researched the Qloo API, wrote the code, tests and documentation, and ran the calibration and benchmark experiments under the author's direction. Inside the product, Claude runs the agents, parses briefs, names taste districts and writes the simulated street voices; every taste number comes from Qloo.
