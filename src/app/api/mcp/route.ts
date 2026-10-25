// MCP endpoint (Streamable HTTP, stateless): lets any agent use Groundswell's
// city model. Point an MCP client at <origin>/api/mcp.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { LaunchEvent } from "@/lib/agents/events";
import { runLaunch } from "@/lib/agents/run";
import { CITIES } from "@/lib/atlas/cities";
import { loadAtlas } from "@/lib/atlas/store";
import { mapFit } from "@/lib/launch/fit";
import { scoutMedia, scoutPartners } from "@/lib/launch/scout";
import type { LaunchSpec } from "@/lib/launch/spec";
import { profileTaste, signalsOf } from "@/lib/launch/taste";
import { resolveVenue, travelWeights } from "@/lib/launch/venue";
import { ENTITY_TYPES } from "@/lib/qloo/params";
import { admit, clientIp, type Bucket } from "@/lib/rate-limit";
import { loadShowcase, SHOWCASES } from "@/lib/showcase";
import { publicMessage } from "@/lib/sse";
import { saveRun } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CityId = z.enum(CITIES.map((c) => c.id) as [string, ...string[]]);
const Comps = z
  .array(z.object({ name: z.string().min(1).max(80), type: z.enum(ENTITY_TYPES) }))
  .min(1)
  .max(4)
  .describe("Well-known comparables whose fans are the launch's audience, e.g. [{name: 'Kali Uchis', type: 'artist'}].");
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function buildServer(ip: string, origin: string) {
  const server = new McpServer({ name: "groundswell", version: "0.1.0" });
  const guarded = async <T,>(bucket: Bucket, fn: () => Promise<T>) => {
    const admission = await admit(ip, bucket);
    if (!admission.ok) throw new Error(admission.message);
    try {
      return await fn();
    } catch (err) {
      throw new Error(publicMessage(err));
    } finally {
      admission.release();
    }
  };

  server.registerTool(
    "list_cities",
    {
      title: "List cities and their taste districts",
      description: "The cities Groundswell models, each with its taste districts: names, what each over-indexes on (with multipliers over the city average) and its main neighbourhoods. Built from Qloo heatmaps of 54 probe entities.",
      inputSchema: {},
    },
    async () =>
      guarded("light", async () => {
        const atlases = await Promise.all(CITIES.map((c) => loadAtlas(c.id)));
        const cities = atlases.map((a) => ({
          id: a.city.id,
          name: a.city.name,
          cells: a.cells.length,
          districts: a.districts.map((d) => ({
            id: d.id,
            name: d.name,
            leansToward: d.signature.slice(0, 5).map((s) => `${a.probes[s.probe].label} ${s.lift.toFixed(1)}×`),
            neighbourhoods: d.places.slice(0, 5),
            shareOfActivity: d.activityShare,
          })),
        }));
        const text = cities.map((c) => `${c.name} (${c.id}): ${c.districts.map((d) => `${d.name} [${d.neighbourhoods.slice(0, 3).join(", ")}]`).join("; ")}`).join("\n");
        return { content: [{ type: "text" as const, text }], structuredContent: { cities } };
      }),
  );

  server.registerTool(
    "taste_twins",
    {
      title: "Find a district's taste twins in other cities",
      description: "For a taste district in one city, the most similar district in each other city, by the similarity of their taste profiles across the same Qloo probes.",
      inputSchema: { city: CityId, district: z.number().int().min(0).describe("District id from list_cities.") },
    },
    async ({ city, district }) =>
      guarded("light", async () => {
        const twins: { from: { city: string; district: number }; to: { city: string; district: number; similarity: number }[] }[] = JSON.parse(
          await readFile(join(process.cwd(), "data", "atlas", "twins.json"), "utf8"),
        );
        const row = twins.find((t) => t.from.city === city && t.from.district === district);
        if (!row) throw new Error("Unknown district. Use list_cities for ids.");
        const named = await Promise.all(
          row.to.map(async (t) => {
            const a = await loadAtlas(t.city);
            return { city: a.city.name, district: a.districts[t.district]?.name, neighbourhoods: a.districts[t.district]?.places.slice(0, 3), similarity: t.similarity };
          }),
        );
        const src = await loadAtlas(city);
        return {
          content: [{ type: "text" as const, text: `${src.districts[district]?.name} (${src.city.name}) is most like:\n${named.map((n) => `- ${n.city}: ${n.district} (${Math.round(n.similarity * 100)}%)`).join("\n")}` }],
          structuredContent: { twins: named },
        };
      }),
  );

  server.registerTool(
    "map_launch_audience",
    {
      title: "Map where a launch's audience lives",
      description:
        "Given comparables (and optionally a venue), maps where in the city the launch's natural audience is concentrated: hot zones with neighbourhood names and each taste district's share. Uses Qloo heatmaps with Groundswell's density correction (validated on held-out entities). About 5 Qloo requests.",
      inputSchema: { city: CityId, comps: Comps, venue: z.string().max(120).optional().describe("Where the launch happens, if it is an event or store.") },
    },
    async ({ city, comps, venue }) =>
      guarded("light", async () => {
        const atlas = await loadAtlas(city);
        const taste = await profileTaste(comps);
        if (!taste.comps.length) throw new Error(`Qloo found none of: ${taste.unresolved.join(", ")}. Try other comparables.`);
        const v = venue ? (await resolveVenue(venue, atlas)).venue : null;
        const fit = await mapFit(atlas, signalsOf(taste), v ? travelWeights(atlas, v) : undefined, v ?? undefined);
        const zones = fit.zones.map((z) => ({ where: z.locality, district: atlas.districts[z.district]?.name, shareOfAudience: z.audienceShare, meanFit: z.fit, center: z.center }));
        const districts = fit.districts.map((d) => ({ district: atlas.districts[d.district]?.name, shareOfAudience: d.audienceShare }));
        const text = `Fans of ${taste.comps.map((c) => c.name).join(", ")} in ${atlas.city.name}${v ? ` (near ${v.name})` : ""}:\nHot zones: ${zones.map((z) => `${z.where} (${pct(z.shareOfAudience)})`).join(", ")}\nBy district: ${districts.map((d) => `${d.district} ${pct(d.shareOfAudience)}`).join("; ")}${taste.peakAge ? `\nFans skew ${taste.peakAge.replaceAll("_", " ")}.` : ""}`;
        return { content: [{ type: "text" as const, text }], structuredContent: { comps: taste.comps.map((c) => c.name), venue: v?.name ?? null, zones, districts, peakAge: taste.peakAge } };
      }),
  );

  server.registerTool(
    "scout_launch_partners",
    {
      title: "Scout partner places, podcasts and brands",
      description:
        "Real places in the launch's hot zones whose crowds over-index on the comparables (with addresses and Qloo affinity), plus podcasts and local brands the audience over-indexes on. Filters out schools, places of worship, clinics and similar; excludes bars when all_ages is true. About 12 Qloo requests.",
      inputSchema: { city: CityId, comps: Comps, all_ages: z.boolean().optional() },
    },
    async ({ city, comps, all_ages }) =>
      guarded("light", async () => {
        const atlas = await loadAtlas(city);
        const taste = await profileTaste(comps);
        if (!taste.comps.length) throw new Error(`Qloo found none of: ${taste.unresolved.join(", ")}.`);
        const signals = signalsOf(taste);
        const fit = await mapFit(atlas, signals);
        const spec = { constraints: { allAges: Boolean(all_ages), noAlcohol: Boolean(all_ages), notes: [] }, venue: null } as unknown as LaunchSpec;
        const [p, m] = await Promise.all([scoutPartners(atlas, fit.zones.slice(0, 4), signals, spec), scoutMedia(atlas, signals)]);
        const partners = p.partners.map((x) => ({ name: x.name, category: x.categories[0] ?? null, address: x.address ?? null, neighbourhood: fit.zones.find((z) => z.id === x.zone)?.locality ?? null, affinity: Number(x.affinity.toFixed(3)), website: x.website ?? null }));
        const text = `Partners: ${partners.map((x) => `${x.name} (${x.category}, ${x.neighbourhood})`).join("; ")}\nPodcasts: ${m.podcasts.map((x) => x.name).join(", ")}\nBrands: ${m.brands.map((x) => x.name).join(", ")}`;
        return { content: [{ type: "text" as const, text }], structuredContent: { partners, podcasts: m.podcasts.map((x) => ({ name: x.name, affinity: x.affinity })), brands: m.brands.map((x) => ({ name: x.name, affinity: x.affinity })) } };
      }),
  );

  server.registerTool(
    "rehearse_launch",
    {
      title: "Rehearse a launch with the full agent team",
      description:
        "Runs Groundswell's rehearsal team on a brief (four Claude agents, three model roles, the Qloo mapping tool and the simulator): profiles the taste on Qloo, maps the city, scouts partners, designs and simulates plans over two or more rounds, and returns the winning week-by-week plan with simulated reach against a no-taste-data benchmark. Takes two to four minutes; limited per caller.",
      inputSchema: {
        brief: z.string().min(12).max(1500).describe("What is launching, for whom, where and when, with any constraints."),
        city: CityId,
        budget: z.number().min(1000).max(250000).optional(),
        days: z.number().int().min(14).max(84).optional(),
      },
    },
    async ({ brief, city, budget, days }) =>
      guarded("rehearse", async () => {
        const events: LaunchEvent[] = [];
        const timed: { t: number; e: LaunchEvent }[] = [];
        const t0 = Date.now();
        const s = await runLaunch({ brief, cityId: city, budget, days }, (e) => {
          events.push(e);
          timed.push({ t: Date.now() - t0, e });
        });
        // Saved like a web run, so the caller can watch the rehearsal it just got.
        const id = `run-${s.runId}`;
        const watch = await saveRun({ id, cityId: city, brief, recordedAt: new Date(t0).toISOString(), events: timed }).then(
          () => `${origin}/rehearse/${id}`,
          () => null,
        );
        const plan = events.find((e): e is Extract<LaunchEvent, { type: "plan" }> => e.type === "plan");
        const base = events.find((e): e is Extract<LaunchEvent, { type: "baseline" }> => e.type === "baseline");
        if (!plan) throw new Error("The team did not produce a plan.");
        const m = plan.sim.metrics;
        const text = [
          plan.plan.headline,
          plan.plan.summary,
          `Simulated reach ${pct(m.reach.mean)} (${pct(m.reach.p10)}–${pct(m.reach.p90)})${base ? ` vs ${pct(base.sim.metrics.reach.mean)} for the same budget spent where people are` : ""}.`,
          ...plan.plan.weeks.map((w) => `${w.label}: ${w.items.join("; ")}`),
          `Partners: ${plan.plan.partners.map((p) => `${p.name}${p.address ? ` (${p.address})` : ""}: ${p.action}`).join(" | ")}`,
          watch ? `Watch the rehearsal and produce its launch kit: ${watch}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { plan: plan.plan, reach: m.reach, benchmarkReach: base?.sim.metrics.reach ?? null, costPerPoint: m.costPerPoint, watch },
        };
      }),
  );

  server.registerTool(
    "get_recorded_rehearsal",
    {
      title: "Get a recorded rehearsal",
      description: `The plan and results of one of Groundswell's recorded rehearsals: ${SHOWCASES.map((s) => `${s.id} (${s.title})`).join(", ")}.`,
      inputSchema: { id: z.enum(SHOWCASES.map((s) => s.id) as [string, ...string[]]) },
    },
    async ({ id }) =>
      guarded("light", async () => {
        const run = await loadShowcase(id);
        if (!run) throw new Error("Not recorded yet.");
        const plan = run.events.map((x) => x.e).find((e): e is Extract<LaunchEvent, { type: "plan" }> => e.type === "plan");
        if (!plan) throw new Error("This recording has no plan.");
        return { content: [{ type: "text" as const, text: `${plan.plan.headline}\n${plan.plan.summary}` }], structuredContent: { brief: run.brief, plan: plan.plan, reach: plan.sim.metrics.reach } };
      }),
  );

  return server;
}

async function handle(req: Request) {
  const server = buildServer(clientIp(req), new URL(req.url).origin);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
