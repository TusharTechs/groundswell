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
    blurb: "Marisol Vega, a new Latin R&B singer, aims to sell out Thalia Hall (about 800 standing).",
    brief:
      "Marisol Vega, a Latin R&B singer in the vein of Omar Apollo and Kali Uchis, plays her first headline show at Thalia Hall in Pilsen, six weeks from now. 21+ show, 800 tickets to sell, $12,000 to promote it.",
    budget: 12000,
    days: 42,
  },
  {
    id: "atlanta-comedy",
    cityId: "atlanta",
    title: "A clean comedy night",
    kind: "Comedy",
    blurb: "Clean Slate, a family-friendly stand-up night at the Tabernacle.",
    brief:
      "Clean Slate, a family-friendly stand-up comedy night in the spirit of Cedric the Entertainer and Steve Harvey, at the Tabernacle in Atlanta, five weeks out. All ages, no alcohol-led partners. $8,000 for promotion.",
    budget: 8000,
    days: 35,
  },
  {
    id: "london-football",
    cityId: "london",
    title: "A supporters' match night",
    kind: "Sports",
    blurb: "Big-screen match nights for Chelsea fans, run by an independent supporters' group.",
    brief:
      "Blue Social, an independent supporters' group (not affiliated with any club), launches free big-screen match nights and a five-a-side tournament for fans of Chelsea and the Premier League in London, eight weeks from now. All ages. The goal is to win new young members across London. $20,000 budget.",
    budget: 20000,
    days: 56,
  },
  {
    id: "tokyo-baseball",
    cityId: "tokyo",
    title: "A baseball café in Tokyo",
    kind: "Food and sport",
    blurb: "Sixty Feet Six, a two-week baseball café and viewing-party pop-up.",
    brief:
      "Sixty Feet Six, a two-week baseball café and viewing-party pop-up in Tokyo for fans of Shohei Ohtani and Major League Baseball, opening six weeks from now. Independent, not affiliated with any team or league. All ages. $25,000 to make it a destination.",
    budget: 25000,
    days: 42,
  },
  {
    id: "new-york-film",
    cityId: "new-york",
    title: "Indie film previews",
    kind: "Film",
    blurb: "Tidewater, an independent coming-of-age film, previews at Nitehawk Williamsburg.",
    brief:
      "Tidewater, an independent coming-of-age film in the vein of Lady Bird and Euphoria, opens with a week of preview screenings at Nitehawk Cinema in Williamsburg, five weeks from now. $10,000 to fill the screenings.",
    budget: 10000,
    days: 35,
  },
  {
    id: "mexico-city-startup",
    cityId: "mexico-city",
    title: "A startup's first store",
    kind: "Retail launch",
    blurb: "Tierra, a sustainable sneaker start-up, opens a pop-up in Roma Norte.",
    brief:
      "Tierra, a sustainable sneaker start-up for people who like Allbirds and Veja, opens its first pop-up store in Roma Norte, Mexico City, in six weeks. $15,000 to make the opening weekend a destination.",
    budget: 15000,
    days: 42,
  },
  {
    id: "los-angeles-release",
    cityId: "los-angeles",
    title: "An album release show",
    kind: "Live music",
    blurb: "K. Rivers, a West Coast rapper, throws a release show at the Wiltern.",
    brief:
      "K. Rivers, a West Coast rapper in the vein of Kendrick Lamar and SZA, throws an album release show at the Wiltern in Koreatown, four weeks out. $15,000 to promote it.",
    budget: 15000,
    days: 28,
  },
];

/** Every showcase launch is fictional (its artist, film, brand or group is invented); the city, venues, comparables and Qloo data are real. */
export const SHOWCASE_NOTE = "Fictional launches; real cities, venues, comparables and Qloo data.";

export interface RecordedRun {
  id: string;
  cityId: string;
  brief: string;
  recordedAt: string;
  /** Where tickets live, when the organiser gave a link (saved live runs only). */
  launchUrl?: string | null;
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
