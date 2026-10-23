// Record every showcase rehearsal (or the ids given) with the live agent team.
//
//   npx tsx --env-file=.env scripts/record-showcases.ts [id…]

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LaunchEvent } from "../src/lib/agents/events";
import { runLaunch } from "../src/lib/agents/run";
import { SHOWCASES } from "../src/lib/showcase";

process.env.QLOO_DISK_CACHE ??= ".cache/qloo";

async function record(sc: (typeof SHOWCASES)[number]) {
  const t0 = Date.now();
  const events: { t: number; e: LaunchEvent }[] = [];
  const s = await runLaunch({ brief: sc.brief, cityId: sc.cityId, budget: sc.budget, days: sc.days }, (e) => events.push({ t: Date.now() - t0, e }));
  await mkdir("data/runs", { recursive: true });
  await writeFile(join("data/runs", `${sc.id}.json`), JSON.stringify({ id: sc.id, cityId: sc.cityId, brief: sc.brief, recordedAt: new Date().toISOString(), events }));
  const plan = events.find((x) => x.e.type === "plan")?.e;
  const base = events.find((x) => x.e.type === "baseline")?.e;
  const pct = (x?: number) => (x === undefined ? "?" : `${(x * 100).toFixed(1)}%`);
  console.log(
    `${sc.id}: ${((Date.now() - t0) / 1000).toFixed(0)} s, ${s.rounds} rounds, plan ${plan?.type === "plan" ? `${plan.plan.strategyId} ${pct(plan.sim.metrics.reach.mean)}` : "none"} vs benchmark ${base?.type === "baseline" ? pct(base.sim.metrics.reach.mean) : "?"}`,
  );
}

async function main() {
  const ids = process.argv.slice(2);
  const list = ids.length ? SHOWCASES.filter((s) => ids.includes(s.id)) : SHOWCASES;
  // Two at a time keeps within the Qloo rate limit and the model's.
  for (let i = 0; i < list.length; i += 2) {
    await Promise.all(list.slice(i, i + 2).map((sc) => record(sc).catch((e) => console.error(`${sc.id} failed:`, e))));
  }
}

main();
