// Recorded rehearsals: real runs of the full agent team, saved with every event
// and its timing, so anyone can watch one instantly and identically to live.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LaunchEvent } from "./agents/events";

export interface Showcase {
  id: string;
  cityId: string;
  title: string;
  kind: string;
  blurb: string;
  brief: string;
  budget: number;
  days: number;
}

export const SHOWCASES: Showcase[] = [
  {
    id: "chicago-headline",
    cityId: "chicago",
    title: "A first headline show",
    kind: "Live music",
    blurb: "1,200 tickets at Thalia Hall in Pilsen, six weeks out.",
    brief:
      "A Latin R&B singer in the vein of Omar Apollo and Kali Uchis plays their first headline show at Thalia Hall in Pilsen, six weeks from now. 21+ show, 1,200 tickets to sell, $12,000 to promote it.",
    budget: 12000,
    days: 42,
  },
  {
    id: "atlanta-comedy",
    cityId: "atlanta",
    title: "A clean comedy night",
    kind: "Comedy",
    blurb: "A family-friendly stand-up night at the Tabernacle.",
    brief:
      "A clean, family-friendly stand-up comedy night in the spirit of Cedric the Entertainer and Steve Harvey at the Tabernacle in Atlanta, five weeks out. All ages, no alcohol-led partners. $8,000 for promotion.",
    budget: 8000,
    days: 35,
  },
  {
    id: "london-football",
    cityId: "london",
    title: "A football fan zone",
    kind: "Sports",
    blurb: "Chelsea F.C. match nights and a kit drop, eight weeks out.",
    brief:
      "Chelsea F.C. is opening a free supporters' fan zone with big-screen match nights and a limited kit drop in London, eight weeks from now. All ages. The goal is to win new young fans across London. $20,000 budget.",
    budget: 20000,
    days: 56,
  },
  {
    id: "tokyo-dodgers",
    cityId: "tokyo",
    title: "A Dodgers pop-up in Tokyo",
    kind: "Sports retail",
    blurb: "An Ohtani-season pop-up store and viewing party.",
    brief:
      "The Los Angeles Dodgers open a two-week pop-up store and viewing party in Tokyo for Shohei Ohtani fans, six weeks from now. All ages. $25,000 to make it a destination.",
    budget: 25000,
    days: 42,
  },
  {
    id: "new-york-film",
    cityId: "new-york",
    title: "Indie film previews",
    kind: "Film",
    blurb: "An A24 coming-of-age film's preview week in Williamsburg.",
    brief:
      "An A24 coming-of-age film in the vein of Euphoria and Lady Bird opens with a week of preview screenings at Nitehawk Cinema in Williamsburg, five weeks from now. $10,000 to fill the screenings.",
    budget: 10000,
    days: 35,
  },
  {
    id: "mexico-city-startup",
    cityId: "mexico-city",
    title: "A startup's first store",
    kind: "Retail launch",
    blurb: "A sustainable sneaker brand's pop-up in Roma Norte.",
    brief:
      "A sustainable sneaker startup (think Allbirds meets Veja) opens its first pop-up store in Roma Norte, Mexico City, in six weeks. $15,000 to make the opening weekend a destination.",
    budget: 15000,
    days: 42,
  },
  {
    id: "los-angeles-release",
    cityId: "los-angeles",
    title: "An album release party",
    kind: "Live music",
    blurb: "A rap album release show at the Wiltern in Koreatown.",
    brief:
      "A West Coast rapper in the vein of Kendrick Lamar and SZA's R&B side throws an album release show at the Wiltern in Koreatown, four weeks out. $15,000 to promote it.",
    budget: 15000,
    days: 28,
  },
];

export interface RecordedRun {
  id: string;
  cityId: string;
  brief: string;
  recordedAt: string;
  events: { t: number; e: LaunchEvent }[];
}

export async function loadShowcase(id: string): Promise<RecordedRun | null> {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  try {
    return JSON.parse(await readFile(join(process.cwd(), "data", "runs", `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

export interface ShowcaseSummary extends Showcase {
  recorded: boolean;
  reach?: number;
  benchmark?: number;
  headline?: string;
  rounds?: number;
  qlooCalls?: number;
}

/** Each showcase with the outcome of its recorded run, for the gallery. */
export async function showcaseSummaries(): Promise<ShowcaseSummary[]> {
  return Promise.all(
    SHOWCASES.map(async (sc) => {
      const run = await loadShowcase(sc.id);
      if (!run) return { ...sc, recorded: false };
      let reach: number | undefined;
      let benchmark: number | undefined;
      let headline: string | undefined;
      let rounds: number | undefined;
      let qlooCalls = 0;
      for (const { e } of run.events) {
        if (e.type === "plan") {
          reach = e.sim.metrics.reach.mean;
          headline = e.plan.headline;
        } else if (e.type === "baseline") benchmark = e.sim.metrics.reach.mean;
        else if (e.type === "done") rounds = e.stats.rounds;
        else if (e.type === "qloo") qlooCalls += e.calls.length;
      }
      return { ...sc, recorded: true, reach, benchmark, headline, rounds, qlooCalls };
    }),
  );
}
