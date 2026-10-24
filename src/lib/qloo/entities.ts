// Typed Qloo operations. Each returns its result plus the evidence (call id,
// path, params) so every claim in the product can link back to the exact
// request that produced it.

import { qlooGet, type QlooCall } from "./client";
import { plausibleMatch } from "./names";
import { urn, type AgeBand, type EntityType } from "./params";

export interface Evidence {
  callId: string;
  path: string;
  params: Record<string, string>;
  ms: number;
  cached: boolean;
}

export interface QlooTag {
  id: string;
  name: string;
  type?: string;
}

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  popularity?: number;
  disambiguation?: string;
  tags: QlooTag[];
}

type RawTag = { id?: string; tag_id?: string; name?: string; type?: string };
export type RawEntity = {
  entity_id: string;
  name: string;
  subtype?: string;
  types?: string[];
  popularity?: number;
  tags?: RawTag[];
  disambiguation?: string;
  affinity?: number;
  properties?: Record<string, unknown>;
  location?: { lat?: number; lon?: number; geohash?: string };
  query?: { affinity?: number; explainability?: unknown; [k: string]: unknown };
};

export const evidenceOf = <T>(c: QlooCall<T>): Evidence => ({
  callId: c.meta.callId,
  path: c.meta.path,
  params: c.meta.params,
  ms: c.meta.ms,
  cached: c.meta.cached,
});

/** The docs show affinity both at the top level and under `query`; accept either. */
export function affinityOf(e: RawEntity): number | undefined {
  if (typeof e.query?.affinity === "number") return e.query.affinity;
  if (typeof e.affinity === "number") return e.affinity;
  return undefined;
}

/** Qloo sometimes stores names in lower case ("omar apollo"); restore title case for display. */
export const tidyName = (name: string) => (name === name.toLowerCase() ? name.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : name);

export function toEntity(e: RawEntity, type: EntityType): Entity {
  return {
    id: e.entity_id,
    name: tidyName(e.name),
    type,
    popularity: e.popularity,
    disambiguation: e.disambiguation,
    tags: (e.tags ?? [])
      .map((t) => ({ id: t.id ?? t.tag_id ?? "", name: t.name ?? "", type: t.type }))
      .filter((t) => t.id),
  };
}

// ------------------------------------------------------------------ resolve

/** First search hit whose name (or an alternative name) plausibly matches; never a lookalike. */
export async function resolveEntity(query: string, type: EntityType, take = 5) {
  const call = await qlooGet<{ results?: (RawEntity & { properties?: { akas?: { value?: string }[] } })[] }>("/search", {
    query,
    types: urn(type),
    take,
  });
  const raw = call.data.results ?? [];
  const i = raw.findIndex((e) => plausibleMatch(query, [e.name, ...(e.properties?.akas ?? []).flatMap((a) => (a.value ? [a.value] : []))]));
  return { entity: i >= 0 ? toEntity(raw[i], type) : null, candidates: raw.map((e) => toEntity(e, type)), evidence: evidenceOf(call) };
}

// ------------------------------------------------------------------ signals

export interface Signals {
  entityIds: string[];
  tagIds?: string[];
  age?: AgeBand;
  gender?: "male" | "female";
  audienceIds?: string[];
}

export function signalParams(s: Signals) {
  return {
    "signal.interests.entities": s.entityIds.length ? s.entityIds.join(",") : undefined,
    "signal.interests.tags": s.tagIds?.length ? s.tagIds.join(",") : undefined,
    "signal.demographics.age": s.age,
    "signal.demographics.gender": s.gender,
    "signal.demographics.audiences": s.audienceIds?.length ? s.audienceIds.join(",") : undefined,
  };
}

const wktPoint = ([lon, lat]: [number, number]) => `POINT(${lon.toFixed(5)} ${lat.toFixed(5)})`;

// ------------------------------------------------------------------ heatmap

export interface HeatCell {
  geohash: string;
  lat: number;
  lon: number;
  /** Qloo's affinity of this cell for the signals, 0–1. */
  affinity: number;
  /** Qloo's popularity of the cell among the returned cells, 0–1 (a relative activity measure). */
  popularity: number;
}

type RawHeatCell = { location?: { latitude?: number; longitude?: number; geohash?: string }; query?: { affinity?: number; popularity?: number } };

/**
 * Where in a circle around `center` the signals over-index, as geohash cells
 * (Qloo heatmap). Qloo picks the cell size from the area; a 20–30 km radius
 * usually comes back as 6-character geohashes (about 1.2 × 0.6 km).
 */
export async function heatmap(center: [number, number], radiusKm: number, signals: Signals) {
  const call = await qlooGet<{ results?: { heatmap?: RawHeatCell[] } }>(
    "/v2/insights",
    {
      "filter.type": "urn:heatmap",
      "filter.location": wktPoint(center),
      "filter.location.radius": Math.round(radiusKm * 1000),
      ...signalParams(signals),
    },
    { timeoutMs: 20_000 },
  );
  const cells: HeatCell[] = (call.data.results?.heatmap ?? []).flatMap((c) => {
    const g = c.location?.geohash;
    const a = c.query?.affinity;
    if (!g || typeof a !== "number" || typeof c.location?.latitude !== "number" || typeof c.location?.longitude !== "number") return [];
    return [{ geohash: g, lat: c.location.latitude, lon: c.location.longitude, affinity: a, popularity: c.query?.popularity ?? 0 }];
  });
  return { cells, evidence: evidenceOf(call) };
}

/** Named neighbourhoods (Qloo localities) with WKT boundaries, strongest first for the signals. */
export async function localities(center: [number, number], radiusKm: number, signals: Signals) {
  const call = await qlooGet<{ results?: { entities?: (RawEntity & { boundary?: string })[] } }>(
    "/v2/insights",
    {
      "filter.type": "urn:heatmap",
      "filter.location": wktPoint(center),
      "filter.location.radius": Math.round(radiusKm * 1000),
      "output.heatmap.boundary": "urn:entity:locality",
      ...signalParams(signals),
      take: 50,
    },
    { timeoutMs: 20_000 },
  );
  const out = (call.data.results?.entities ?? []).flatMap((e) =>
    e.boundary ? [{ id: e.entity_id, name: e.name, affinity: affinityOf(e) ?? 0, boundary: e.boundary }] : [],
  );
  return { localities: out, evidence: evidenceOf(call) };
}

// ------------------------------------------------------------------ places

export interface Place {
  id: string;
  name: string;
  affinity: number;
  lat: number;
  lon: number;
  address?: string;
  categories: string[];
  tags: QlooTag[];
  priceLevel?: number;
  website?: string;
  phone?: string;
  rating?: number;
  /** Qloo's neighbourhood name for the place, when it has one. */
  neighborhood?: string;
  /** Qloo popularity, 0–1: global chains sit near 1. */
  popularity?: number;
  /** Days the place is open, from Qloo's opening hours (empty when unknown). */
  openDays: string[];
  /** Which signal entities pulled this place in, with their share. */
  drivers: { id: string; share: number }[];
}

type ExplainRow = { entity_id?: string; score?: number };

function driversOf(e: RawEntity): { id: string; share: number }[] {
  const raw = (e.query?.explainability as { "signal.interests.entities"?: ExplainRow[] } | undefined)?.["signal.interests.entities"] ?? [];
  return raw.flatMap((d) => (d.entity_id && typeof d.score === "number" ? [{ id: d.entity_id, share: d.score }] : [])).sort((a, b) => b.share - a.share);
}

function placeOf(e: RawEntity): Place | null {
  const p = (e.properties ?? {}) as {
    address?: string;
    geocode?: { latitude?: number; longitude?: number; name?: string };
    business_rating?: number;
    price_level?: number;
    neighborhood?: string;
    hours?: Record<string, { closed?: boolean }[]>;
    website?: string;
    phone?: string;
  };
  const lat = e.location?.lat ?? p.geocode?.latitude;
  const lon = e.location?.lon ?? p.geocode?.longitude;
  const a = affinityOf(e);
  if (typeof lat !== "number" || typeof lon !== "number" || a === undefined) return null;
  const tags = (e.tags ?? []).map((t) => ({ id: t.id ?? t.tag_id ?? "", name: t.name ?? "", type: t.type })).filter((t) => t.id);
  return {
    id: e.entity_id,
    name: e.name,
    affinity: a,
    lat,
    lon,
    address: p.address,
    categories: tags.filter((t) => t.type === "urn:tag:category:place" || t.id.startsWith("urn:tag:category:place")).map((t) => t.name).slice(0, 4),
    tags,
    priceLevel: p.price_level,
    website: p.website,
    phone: p.phone,
    rating: p.business_rating,
    neighborhood: p.neighborhood || p.geocode?.name,
    popularity: e.popularity,
    openDays: Object.entries(p.hours ?? {})
      .filter(([, slots]) => slots.some((x) => !x.closed))
      .map(([day]) => day),
    drivers: driversOf(e),
  };
}

/** Real places within `radiusKm` of a point whose crowd over-indexes on the signals. */
export async function placesNear(
  point: [number, number],
  radiusKm: number,
  signals: Signals,
  opts: { take?: number; excludeTagIds?: string[]; includeTagIds?: string[]; priceMax?: number } = {},
) {
  const call = await qlooGet<{ results?: { entities?: RawEntity[] } }>("/v2/insights", {
    "filter.type": urn("place"),
    "filter.location": wktPoint(point),
    "filter.location.radius": Math.round(radiusKm * 1000),
    ...signalParams(signals),
    "filter.exclude.tags": opts.excludeTagIds?.length ? opts.excludeTagIds.join(",") : undefined,
    "filter.tags": opts.includeTagIds?.length ? opts.includeTagIds.join(",") : undefined,
    "operator.filter.tags": opts.includeTagIds?.length ? "union" : undefined,
    "filter.price_level.max": opts.priceMax,
    "feature.explainability": true,
    take: opts.take ?? 12,
  });
  const places = (call.data.results?.entities ?? []).flatMap((e) => placeOf(e) ?? []);
  return { places, evidence: evidenceOf(call) };
}

// ------------------------------------------------------------------ recommendations

export interface Recommended extends Entity {
  affinity: number;
  drivers: { id: string; share: number }[];
}

/** Entities of `type` the signals over-index on, optionally biased to a city (brands and places honour location). */
export async function recommend(
  type: EntityType,
  signals: Signals,
  opts: { take?: number; locationQuery?: string; popularityMin?: number; excludeIds?: string[] } = {},
) {
  const call = await qlooGet<{ results?: { entities?: RawEntity[] } }>("/v2/insights", {
    "filter.type": urn(type),
    ...signalParams(signals),
    "signal.location.query": opts.locationQuery,
    "filter.popularity.min": opts.popularityMin,
    "filter.exclude.entities": opts.excludeIds?.length ? opts.excludeIds.join(",") : undefined,
    "feature.explainability": true,
    take: opts.take ?? 10,
  });
  const items: Recommended[] = (call.data.results?.entities ?? []).flatMap((e) => {
    const a = affinityOf(e);
    return a === undefined ? [] : [{ ...toEntity(e, type), affinity: a, drivers: driversOf(e) }];
  });
  return { items, evidence: evidenceOf(call) };
}

// ------------------------------------------------------------------ audience

export type AgeProfile = Partial<Record<AgeBand, number>>;

/** Relative age and gender skew of an entity's fans (Qloo demographics). */
export async function demographics(entityIds: string[]) {
  const call = await qlooGet<{ results?: { demographics?: { entity_id: string; query?: { age?: AgeProfile; gender?: { male?: number; female?: number } } }[] } }>(
    "/v2/insights",
    { "filter.type": "urn:demographics", "signal.interests.entities": entityIds.join(",") },
  );
  const rows = call.data.results?.demographics ?? [];
  return {
    rows: rows.map((r) => ({ entityId: r.entity_id, age: r.query?.age ?? {}, gender: r.query?.gender ?? {} })),
    evidence: evidenceOf(call),
  };
}

export interface AudienceSegment {
  id: string;
  name: string;
  affinity: number;
}

/** Qloo audience segments that over-index for the signals (urn:audience). */
export async function audienceSegments(signals: Signals, take = 12) {
  const call = await qlooGet<{ results?: { entities?: RawEntity[] } }>("/v2/insights", {
    "filter.type": "urn:audience",
    ...signalParams(signals),
    take,
  });
  const segments: AudienceSegment[] = (call.data.results?.entities ?? []).flatMap((e) => {
    const a = affinityOf(e);
    return a === undefined ? [] : [{ id: e.entity_id, name: e.name, affinity: a }];
  });
  return { segments, evidence: evidenceOf(call) };
}

/** Taste tags the signals over-index on (urn:tag), optionally limited to tag types. */
export async function tasteTags(signals: Signals, opts: { take?: number; tagTypes?: string[] } = {}) {
  const call = await qlooGet<{ results?: { tags?: (RawTag & { query?: { affinity?: number } })[]; entities?: (RawTag & { query?: { affinity?: number } })[] } }>(
    "/v2/insights",
    {
      "filter.type": "urn:tag",
      ...signalParams(signals),
      "filter.tag.types": opts.tagTypes?.length ? opts.tagTypes.join(",") : undefined,
      take: opts.take ?? 12,
    },
  );
  const raw = call.data.results?.tags ?? call.data.results?.entities ?? [];
  const tags = raw.flatMap((t) => {
    const id = t.id ?? t.tag_id;
    return id && t.name ? [{ id, name: t.name, type: t.type, affinity: t.query?.affinity ?? 0 }] : [];
  });
  return { tags, evidence: evidenceOf(call) };
}

/** Qloo place-category tag ids for plain words ("record store" → urn:tag:category:place:record_store). */
export async function placeCategoryTags(words: string[]) {
  const results = await Promise.all(words.map((w) => searchTags(w, 8)));
  const ids = results.flatMap((r) => r.tags.filter((t) => t.id.startsWith("urn:tag:category:place:")).slice(0, 1).map((t) => t.id));
  return { ids: [...new Set(ids)], evidence: results.map((r) => r.evidence) };
}

/** Search Qloo's tag taxonomy by keyword. */
export async function searchTags(query: string, take = 8) {
  const call = await qlooGet<{ results?: { tags?: RawTag[] } }>("/v2/tags", { "filter.query": query, take });
  const tags = (call.data.results?.tags ?? []).flatMap((t) => {
    const id = t.id ?? t.tag_id;
    return id && t.name ? [{ id, name: t.name, type: t.type }] : [];
  });
  return { tags, evidence: evidenceOf(call) };
}
