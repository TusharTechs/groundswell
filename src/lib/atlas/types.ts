// The Taste Atlas: a city as a grid of ~1 km cells, each with a taste
// fingerprint built from Qloo heatmaps of a fixed set of probe entities.

import type { EntityType } from "../qloo/params";
import type { CityDef } from "./cities";
import type { ProbeDef } from "./probes";

export interface AtlasProbe {
  id: string;
  name: string;
  label: string;
  type: EntityType;
  domain: ProbeDef["domain"];
}

export interface AtlasCell {
  /** 6-character geohash. */
  gh: string;
  lon: number;
  lat: number;
  /** Relative Qloo activity in the cell, 0–1 (mean heatmap popularity, weighted by how many probes the cell appears in). */
  activity: number;
  /** Name of the smallest Qloo locality containing the cell, if any. */
  locality: string | null;
  /** Index into CityAtlas.districts. */
  district: number;
}

export interface District {
  id: number;
  /** Short evocative name, written by Claude from the Qloo signature (labelled as such in the UI). */
  name: string;
  blurb: string;
  /** Probes this district leans toward most (mean taste lean across its cells), with lift over the city average. */
  signature: { probe: number; z: number; lift: number }[];
  /** Probes it leans away from. */
  antiSignature: { probe: number; z: number; lift: number }[];
  /** Localities that contribute most of its cells. */
  places: string[];
  cells: number;
  /** Share of the city's activity in this district. */
  activityShare: number;
  center: [number, number];
  color: [number, number, number];
}

export interface Locality {
  name: string;
  center: [number, number];
}

export interface CityAtlas {
  version: 1;
  city: CityDef;
  builtAt: string;
  probes: AtlasProbe[];
  cells: AtlasCell[];
  /**
   * Row-major cells × probes matrix of within-city percentiles (0–255) of each
   * cell's Qloo heatmap affinity for each probe; 0 where Qloo returned no cell.
   * Base64-encoded bytes.
   */
  vectors: string;
  districts: District[];
  /** For each cell, indices of adjacent cells (geohash neighbours present in the grid). */
  geo: number[][];
  /** For each cell, [index, similarity] of distant cells with the most similar taste (weak ties across town). */
  ties: [number, number][][];
  localities: Locality[];
  stats: { qlooCalls: number; probes: number; activeProbes: number; cells: number; geohashPrecision: number[] };
}
