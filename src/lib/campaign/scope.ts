// Whose state a mission-control request touches. Real scans from tracked links
// always belong to the campaign. On a showcase campaign (a public demo), the
// simulated weeks and the Field Analyst's re-plans belong to the visitor who
// made them, so one visitor's demo never changes what the next one sees. On a
// visitor's own campaign, whoever holds the link is the organiser.

import { isShowcaseKit } from "../kit/load";
import { loadReplan, scansFor, type Scan } from "../store";
import { DEMO_HEADER } from "./demo";
const SESSION = /^[a-z0-9]{16,40}$/;

export interface Scope {
  /** Where real scans live. */
  campaign: string;
  /** Where this visitor's simulated scans and re-plan live. */
  own: string;
  showcase: boolean;
}

export async function scopeOf(id: string, req: Request): Promise<Scope | { error: string }> {
  const showcase = await isShowcaseKit(id);
  if (!showcase) return { campaign: id, own: id, showcase };
  const session = req.headers.get(DEMO_HEADER) ?? "";
  if (!SESSION.test(session)) return { error: "This demo campaign needs a demo session; reload the page." };
  return { campaign: id, own: `${id}~${session}`, showcase };
}

/** Real scans for the campaign, plus this visitor's simulated ones on a showcase. */
export async function scansIn(scope: Scope): Promise<Scan[]> {
  if (!scope.showcase) return scansFor(scope.campaign);
  const [real, own] = await Promise.all([scansFor(scope.campaign), scansFor(scope.own)]);
  return [...real.filter((s) => !s.simulated), ...own].sort((a, b) => a.at.localeCompare(b.at));
}

export const replanIn = <T>(scope: Scope) => loadReplan<T>(scope.own);
