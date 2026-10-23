// The launch's taste profile on Qloo: resolved comparables, who their fans
// are (age skew, Qloo audience segments) and what else they over-index on.

import { AGE_BANDS, type AgeBand, type EntityType } from "../qloo/params";
import {
  audienceSegments,
  demographics,
  resolveEntity,
  tasteTags,
  type AudienceSegment,
  type Entity,
  type Evidence,
  type Signals,
} from "../qloo/entities";

export interface TasteProfile {
  comps: Entity[];
  unresolved: string[];
  /** Mean relative age skew of the comparables' fans (positive = over-indexes). */
  age: Partial<Record<AgeBand, number>>;
  /** The age band the fans skew to most, used as a signal only when the brief gave none. */
  peakAge: AgeBand | null;
  gender: { male: number; female: number } | null;
  segments: AudienceSegment[];
  tags: { id: string; name: string; affinity: number }[];
  evidence: Evidence[];
}

export function signalsOf(profile: Pick<TasteProfile, "comps">, age?: AgeBand | null): Signals {
  return { entityIds: profile.comps.map((c) => c.id), age: age ?? undefined };
}

export async function profileTaste(comps: { name: string; type: EntityType }[]): Promise<TasteProfile> {
  const resolved = await Promise.all(comps.map((c) => resolveEntity(c.name, c.type)));
  const found = resolved.flatMap((r) => (r.entity ? [r.entity] : []));
  const unresolved = comps.filter((_, i) => !resolved[i].entity).map((c) => c.name);
  const evidence = resolved.map((r) => r.evidence);
  if (!found.length) {
    return { comps: [], unresolved, age: {}, peakAge: null, gender: null, segments: [], tags: [], evidence };
  }
  const signals: Signals = { entityIds: found.map((c) => c.id) };
  const [demo, segs, tags] = await Promise.all([
    demographics(found.map((c) => c.id)),
    audienceSegments(signals, 10).catch(() => null),
    tasteTags(signals, { take: 12, tagTypes: ["urn:tag:keyword:qloo", "urn:tag:genre:qloo"] }).catch(() => null),
  ]);
  evidence.push(demo.evidence);
  if (segs) evidence.push(segs.evidence);
  if (tags) evidence.push(tags.evidence);

  const age: Partial<Record<AgeBand, number>> = {};
  for (const band of AGE_BANDS) {
    const vals = demo.rows.map((r) => r.age[band]).filter((v): v is number => typeof v === "number");
    if (vals.length) age[band] = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 1000) / 1000;
  }
  const peak = (Object.entries(age) as [AgeBand, number][]).sort((a, b) => b[1] - a[1])[0];
  const g = demo.rows.map((r) => r.gender).filter((x) => typeof x.male === "number" || typeof x.female === "number");
  const gender = g.length
    ? {
        male: Math.round((g.reduce((s, x) => s + (x.male ?? 0), 0) / g.length) * 1000) / 1000,
        female: Math.round((g.reduce((s, x) => s + (x.female ?? 0), 0) / g.length) * 1000) / 1000,
      }
    : null;

  return {
    comps: found,
    unresolved,
    age,
    peakAge: peak && peak[1] > 0 ? peak[0] : null,
    gender,
    segments: (segs?.segments ?? []).slice(0, 8),
    tags: (tags?.tags ?? []).slice(0, 10).map((t) => ({ id: t.id, name: t.name, affinity: t.affinity })),
    evidence,
  };
}
