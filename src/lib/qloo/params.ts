// Qloo silently ignores parameters it does not recognise, which turns a typo
// into an empty or misleading result. Every parameter we send must appear in
// this list, taken from https://docs.qloo.com/reference/parameters and the
// endpoint references. Extend it only after checking the docs.

const SEARCH = [
  "query", "types", "filter.location", "filter.radius", "filter.exists", "filter.tags",
  "operator.filter.tags", "filter.rating", "filter.popularity", "filter.address",
  "page", "take", "sort_by",
];

const INSIGHTS = [
  "filter.type",
  // signals
  "signal.interests.entities", "signal.interests.entities.weight", "signal.interests.tags",
  "operator.signal.interests.tags", "signal.demographics.age", "signal.demographics.age.weight",
  "signal.demographics.gender", "signal.demographics.gender.weight", "signal.demographics.audiences",
  "signal.demographics.audiences.weight", "signal.location", "signal.location.query",
  "signal.location.radius", "signal.location.weight",
  "bias.trends", "bias.content_based",
  // filters
  "filter.tags", "operator.filter.tags", "filter.exclude.tags", "operator.exclude.tags",
  "filter.exclude.entities", "filter.results.entities", "filter.results.tags",
  "filter.popularity.min", "filter.popularity.max", "filter.parents.types", "filter.tag.types",
  "filter.exists", "filter.location", "filter.location.query", "filter.location.radius",
  "filter.geocode.name", "filter.geocode.admin1_region", "filter.geocode.admin2_region",
  "filter.geocode.country_code", "filter.release_year.min", "filter.release_year.max",
  "filter.release_country", "filter.content_rating", "filter.rating.min", "filter.rating.max",
  "filter.price_level.min", "filter.price_level.max",
  // output
  "take", "page", "offset", "sort_by", "diversify.by", "diversify.take",
  "feature.explainability", "output.heatmap.boundary",
];

const TAGS = [
  "filter.query", "feature.typo_tolerance", "feature.semantic_search", "filter.tag.types",
  "filter.parents.types", "filter.results.tags", "filter.popularity.min", "filter.popularity.max",
  "page", "take",
];

const TRENDING = [
  "filter.type", "filter.start_date", "filter.end_date", "signal.interests.entities",
  "take", "offset", "page",
];

const COMPARE = [
  "a.signal.interests.entities", "b.signal.interests.entities", "filter.type", "filter.subtype",
  "model", "page", "take", "offset",
];

const ALLOWED: Record<string, Set<string>> = {
  "/": new Set(),
  "/search": new Set(SEARCH),
  "/entities": new Set(["entity_ids"]),
  "/v2/insights": new Set(INSIGHTS),
  "/v2/tags": new Set(TAGS),
  "/v2/tags/types": new Set(["filter.parents.types", "page", "take"]),
  "/v2/audiences": new Set(["filter.query", "filter.audience.types", "filter.parents.types", "page", "take"]),
  "/v2/trending": new Set(TRENDING),
  "/v2/analysis/compare": new Set(COMPARE),
};

export function assertKnownParams(path: string, params: Record<string, unknown>) {
  const allowed = ALLOWED[path];
  if (!allowed) throw new Error(`Unknown Qloo path ${path}. Add it to params.ts after checking the docs.`);
  const unknown = Object.keys(params).filter((k) => params[k] !== undefined && !allowed.has(k));
  if (unknown.length) {
    throw new Error(`Unrecognised Qloo parameter(s) for ${path}: ${unknown.join(", ")}`);
  }
}

export const ENTITY_TYPES = [
  "artist", "book", "brand", "destination", "movie", "person", "place", "podcast", "tv_show", "videogame",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const AGE_BANDS = [
  "24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older",
] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const urn = (t: EntityType) => `urn:entity:${t}`;
