// Produce the Launch Kit for each recorded showcase (or the ids given) with the
// Creative Director, from the same rehearsal events the war room replays.
//
//   npx tsx --env-file=.env scripts/record-kits.ts [id…]

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LaunchEvent, MediaView, PartnerView, StrategyView } from "../src/lib/agents/events";
import { loadAtlas } from "../src/lib/atlas/store";
import { kitInputFrom, launchDateFrom } from "../src/lib/kit/input";
import { runCreativeDirector } from "../src/lib/kit/director";
import type { Candidate } from "../src/lib/launch/actions";
import type { Zone } from "../src/lib/launch/fit";
import type { LaunchSpec } from "../src/lib/launch/spec";
import { loadShowcase, SHOWCASES } from "../src/lib/showcase";

process.env.QLOO_DISK_CACHE ??= ".cache/qloo";

const title = (name: string) => (name === name.toLowerCase() ? name.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : name);

async function record(id: string) {
  const run = await loadShowcase(id);
  if (!run) throw new Error(`No recording for ${id}`);
  let spec: LaunchSpec | undefined;
  let taste: Extract<LaunchEvent, { type: "taste" }> | undefined;
  let zones: Zone[] | undefined;
  let partners: PartnerView[] | undefined;
  let media: MediaView[] | undefined;
  let candidates: Candidate[] | undefined;
  let winner: string | undefined;
  const strategies = new Map<string, StrategyView>();
  for (const { e } of run.events) {
    if (e.type === "spec") spec = e.spec;
    else if (e.type === "taste") taste = e;
    else if (e.type === "fit") zones = e.zones;
    else if (e.type === "menu") {
      zones = e.zones ?? zones;
      partners = e.partners;
      media = e.media;
      candidates = e.candidates;
    } else if (e.type === "strategies") for (const s of e.strategies) strategies.set(s.id, s);
    else if (e.type === "plan") winner = e.plan.strategyId;
  }
  const strategy = winner ? strategies.get(winner) : undefined;
  if (!spec || !zones || !partners || !media || !candidates || !strategy) throw new Error(`${id}: the recording has no finished plan`);
  const atlas = await loadAtlas(run.cityId);
  const input = kitInputFrom({
    campaignId: id,
    atlas,
    spec,
    comps: (taste?.comps ?? spec.comps).map((c) => title(c.name)),
    compIds: (taste?.comps ?? []).map((c) => c.id),
    peakAge: taste?.peakAge ?? null,
    tags: (taste?.tags ?? []).map((t) => t.name),
    zones,
    partners,
    media,
    candidates,
    strategy,
    launchDate: launchDateFrom(new Date(run.recordedAt), spec.days),
    launchUrl: null,
  });
  const t0 = Date.now();
  const kit = await runCreativeDirector(input, (e) => {
    if (e.type === "kit-check") console.log(`  ${id}: ${e.name} in ${e.zone}: ${e.verdict}`);
  });
  await mkdir("data/kits", { recursive: true });
  await writeFile(join("data/kits", `${id}.json`), JSON.stringify(kit, null, 1));
  console.log(
    `${id}: ${((Date.now() - t0) / 1000).toFixed(0)} s, ${kit.zones.length} zones, ${kit.partners.length} emails, ${kit.podcasts.length} podcast scripts, ${kit.checks.length} references checked`,
  );
}

async function main() {
  const ids = process.argv.slice(2);
  const list = ids.length ? ids : SHOWCASES.map((s) => s.id);
  for (let i = 0; i < list.length; i += 2) {
    await Promise.all(list.slice(i, i + 2).map((id) => record(id).catch((e) => console.error(`${id} failed:`, e))));
  }
}

main();
