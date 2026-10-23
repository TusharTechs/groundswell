// Probe entities: a fixed, global set of artists, shows, brands, games,
// podcasts and people. A city cell's taste fingerprint is how strongly it leans
// toward each probe (Qloo heatmap affinity), so the same probes in every city
// make cells comparable across cities.
//
// Films are left out on purpose: Qloo's heatmaps for films cover only a few
// percent of a city's cells, too sparse to describe neighbourhoods. Artists,
// brands, series and podcasts cover most of them.

import type { EntityType } from "../qloo/params";

export interface ProbeDef {
  query: string;
  type: EntityType;
  /** Short label for charts. */
  label: string;
  domain: "music" | "screen" | "brand" | "games" | "podcast" | "sport";
}

export const PROBES: ProbeDef[] = [
  // music
  { query: "Taylor Swift", type: "artist", label: "Taylor Swift", domain: "music" },
  { query: "Bad Bunny", type: "artist", label: "Bad Bunny", domain: "music" },
  { query: "Travis Scott", type: "artist", label: "Travis Scott", domain: "music" },
  { query: "Beyoncé", type: "artist", label: "Beyoncé", domain: "music" },
  { query: "Kendrick Lamar", type: "artist", label: "Kendrick Lamar", domain: "music" },
  { query: "SZA", type: "artist", label: "SZA", domain: "music" },
  { query: "BTS", type: "artist", label: "BTS", domain: "music" },
  { query: "Billie Eilish", type: "artist", label: "Billie Eilish", domain: "music" },
  { query: "Radiohead", type: "artist", label: "Radiohead", domain: "music" },
  { query: "Metallica", type: "artist", label: "Metallica", domain: "music" },
  { query: "Coldplay", type: "artist", label: "Coldplay", domain: "music" },
  { query: "Luke Combs", type: "artist", label: "Luke Combs", domain: "music" },
  { query: "Morgan Wallen", type: "artist", label: "Morgan Wallen", domain: "music" },
  { query: "Daft Punk", type: "artist", label: "Daft Punk", domain: "music" },
  { query: "Shakira", type: "artist", label: "Shakira", domain: "music" },
  { query: "Karol G", type: "artist", label: "Karol G", domain: "music" },
  { query: "Peso Pluma", type: "artist", label: "Peso Pluma", domain: "music" },
  { query: "Phoebe Bridgers", type: "artist", label: "Phoebe Bridgers", domain: "music" },
  { query: "Lana Del Rey", type: "artist", label: "Lana Del Rey", domain: "music" },
  { query: "Tyler, the Creator", type: "artist", label: "Tyler, the Creator", domain: "music" },
  { query: "Burna Boy", type: "artist", label: "Burna Boy", domain: "music" },
  { query: "Fleetwood Mac", type: "artist", label: "Fleetwood Mac", domain: "music" },
  { query: "Fred again..", type: "artist", label: "Fred again..", domain: "music" },
  { query: "Olivia Rodrigo", type: "artist", label: "Olivia Rodrigo", domain: "music" },
  // screen
  { query: "Friends", type: "tv_show", label: "Friends", domain: "screen" },
  { query: "Stranger Things", type: "tv_show", label: "Stranger Things", domain: "screen" },
  { query: "RuPaul's Drag Race", type: "tv_show", label: "Drag Race", domain: "screen" },
  { query: "Yellowstone", type: "tv_show", label: "Yellowstone", domain: "screen" },
  { query: "The Office", type: "tv_show", label: "The Office", domain: "screen" },
  // brands
  { query: "Nike", type: "brand", label: "Nike", domain: "brand" },
  { query: "Adidas", type: "brand", label: "Adidas", domain: "brand" },
  { query: "Patagonia", type: "brand", label: "Patagonia", domain: "brand" },
  { query: "Starbucks", type: "brand", label: "Starbucks", domain: "brand" },
  { query: "Supreme", type: "brand", label: "Supreme", domain: "brand" },
  { query: "Lululemon", type: "brand", label: "Lululemon", domain: "brand" },
  { query: "Gucci", type: "brand", label: "Gucci", domain: "brand" },
  { query: "Chanel", type: "brand", label: "Chanel", domain: "brand" },
  { query: "Zara", type: "brand", label: "Zara", domain: "brand" },
  { query: "IKEA", type: "brand", label: "IKEA", domain: "brand" },
  { query: "Apple", type: "brand", label: "Apple", domain: "brand" },
  { query: "Tesla", type: "brand", label: "Tesla", domain: "brand" },
  { query: "Harley-Davidson", type: "brand", label: "Harley-Davidson", domain: "brand" },
  { query: "Red Bull", type: "brand", label: "Red Bull", domain: "brand" },
  { query: "Uniqlo", type: "brand", label: "Uniqlo", domain: "brand" },
  { query: "McDonald's", type: "brand", label: "McDonald's", domain: "brand" },
  { query: "The North Face", type: "brand", label: "The North Face", domain: "brand" },
  { query: "Carhartt", type: "brand", label: "Carhartt", domain: "brand" },
  // games
  { query: "Fortnite", type: "videogame", label: "Fortnite", domain: "games" },
  { query: "Minecraft", type: "videogame", label: "Minecraft", domain: "games" },
  { query: "Call of Duty", type: "videogame", label: "Call of Duty", domain: "games" },
  // podcasts
  { query: "The Joe Rogan Experience", type: "podcast", label: "Joe Rogan", domain: "podcast" },
  { query: "Call Her Daddy", type: "podcast", label: "Call Her Daddy", domain: "podcast" },
  // sport
  { query: "Lionel Messi", type: "person", label: "Lionel Messi", domain: "sport" },
  { query: "LeBron James", type: "person", label: "LeBron James", domain: "sport" },
];
