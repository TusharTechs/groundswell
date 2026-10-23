// Run one launch rehearsal from the terminal, print what the agents do, and
// record every event (with its time offset) so the run can be replayed.
//
//   npm run launch -- --city chicago --budget 12000 "Brief text…"
//   npm run launch -- --city chicago --save showcase-id "Brief text…"

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LaunchEvent } from "../src/lib/agents/events";
import { runLaunch } from "../src/lib/agents/run";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const flags = new Set(["--city", "--budget", "--days", "--save"]);
  const words = process.argv.slice(2).filter((a, i, all) => !flags.has(a) && !flags.has(all[i - 1] ?? ""));
  const brief = words.join(" ").trim();
  if (!brief) throw new Error('Give a brief, e.g. npm run launch -- --city chicago "A Latin R&B artist…"');
  const cityId = arg("city") ?? "chicago";
  const save = arg("save");
  const t0 = Date.now();
  const events: { t: number; e: LaunchEvent }[] = [];
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  const emit = (e: LaunchEvent) => {
    events.push({ t: Date.now() - t0, e });
    const t = `${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`;
    switch (e.type) {
      case "spec":
        console.log(`${t} spec: ${e.spec.title} · ${e.spec.kind} · comps ${e.spec.comps.map((c) => c.name).join(", ")} · $${e.spec.budget} · ${e.spec.days} days`);
        break;
      case "agent":
        console.log(`${t} [${e.agent}] ${e.state === "working" ? "…" : "✓"} ${e.note}`);
        break;
      case "thought":
        console.log(`${t}   ${e.agent === "director" ? "Director" : e.agent}: ${e.text}`);
        break;
      case "qloo":
        console.log(`${t}   ${e.calls.length} Qloo call(s)`);
        break;
      case "strategies":
        for (const s of e.strategies) console.log(`${t}   plan ${s.id} "${s.name}" $${s.cost}: ${s.thesis}`);
        break;
      case "baseline":
        console.log(`${t}   benchmark: ${pct(e.sim.metrics.reach.mean)} reach`);
        break;
      case "sim":
        for (const r of e.results) console.log(`${t}   ${r.strategyId}: ${pct(r.metrics.reach.mean)} (${pct(r.metrics.reach.p10)}–${pct(r.metrics.reach.p90)}), $${r.metrics.cost}, WOM ${pct(r.metrics.wordOfMouthShare)}`);
        break;
      case "critique":
        console.log(`${t}   critic: best ${e.critique.best}. ${e.critique.summary}`);
        for (const c of e.critique.changes) console.log(`${t}     - ${c.change}`);
        break;
      case "voices":
        for (const v of e.voices) console.log(`${t}   ${v.name} (${v.where}, ${v.stance}): "${v.quote}"`);
        break;
      case "plan":
        console.log(`${t} PLAN ${e.plan.strategyId}: ${e.plan.headline}\n        ${e.plan.summary}`);
        for (const w of e.plan.weeks) console.log(`        ${w.label}: ${w.items.join(" / ")}`);
        break;
      case "done":
        console.log(`${t} done: ${e.stats.rounds} rounds, ${e.stats.qlooCalls} Qloo calls, ${e.stats.llmCalls} model calls`);
        break;
      case "error":
        console.log(`${t} ERROR ${e.message}`);
        break;
    }
  };

  await runLaunch({ brief, cityId, budget: arg("budget") ? Number(arg("budget")) : undefined, days: arg("days") ? Number(arg("days")) : undefined }, emit);
  if (save) {
    await mkdir("data/runs", { recursive: true });
    const file = join("data/runs", `${save}.json`);
    await writeFile(file, JSON.stringify({ id: save, cityId, brief, recordedAt: new Date().toISOString(), events }));
    console.log(`saved ${file} (${events.length} events)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
