// Write the recorded rehearsals' results into README.md between the SHOWCASES markers.
//   SITE_URL=https://… npx tsx scripts/readme-showcases.ts   (links each launch to the live replay)
import { readFile, writeFile } from "node:fs/promises";
import { CITIES } from "../src/lib/atlas/cities";
import { showcaseSummaries } from "../src/lib/showcase";

async function main() {
  const rows = await showcaseSummaries();
  const pct = (x?: number) => (x === undefined ? "—" : `${(x * 100).toFixed(1)}%`);
  const table = [
    "| Launch | City | Plan's reach | Same budget, no taste data | Rounds | Qloo requests |",
    "|---|---|---|---|---|---|",
    ...rows.map((r) => {
      const lift = r.reach && r.benchmark ? ` (${(r.reach / r.benchmark).toFixed(1)}×)` : "";
      const title = process.env.SITE_URL ? `[${r.title}](${process.env.SITE_URL.replace(/\/$/, "")}/rehearse/${r.id})` : `**${r.title}**`;
      return `| ${title}: ${r.blurb} | ${CITIES.find((c) => c.id === r.cityId)?.name} | **${pct(r.reach)}**${lift} | ${pct(r.benchmark)} | ${r.rounds ?? "—"} | ${r.qlooCalls ?? "—"} |`;
    }),
  ].join("\n");
  const readme = await readFile("README.md", "utf8");
  const start = readme.indexOf("<!-- SHOWCASES -->");
  const end = readme.indexOf("<!-- /SHOWCASES -->");
  const block = `<!-- SHOWCASES -->\n${table}\n\nReach is the share of the city's natural audience (people whose taste fits the launch, weighted by distance to the venue) reached by launch day in the simulation.\n<!-- /SHOWCASES -->`;
  const next = end > start ? readme.slice(0, start) + block + readme.slice(end + "<!-- /SHOWCASES -->".length) : readme.replace("<!-- SHOWCASES -->", block);
  await writeFile("README.md", next);
  console.log(table);
}
main();
