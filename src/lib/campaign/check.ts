// The Field Analyst's submit checks, as a pure function so they can be tested:
// no move larger than what an action has left, no unknown zones or actions, no
// partners that didn't come from its Qloo search, and only small test moves
// while every neighbourhood is still too early to call.

import { z } from "zod";
import type { remainingBudget, ZoneReport } from "./report";

/** What the Field Analyst submits. */
export const ReplanDraft = z.object({
  summary: z.string().describe("Two or three sentences: what the data say and what changes."),
  moves: z
    .array(
      z.object({
        from_step: z.number().int().describe("Index of a plan action with budget left."),
        to: z.string().describe("Where the money goes: an existing action or a new one, e.g. 'Instagram ads in Pilsen'."),
        to_zone_id: z.number().int().nullable(),
        amount: z.number().positive(),
        why: z.string(),
      }),
    )
    .max(6),
  new_partners: z.array(z.object({ place_id: z.string(), role: z.string(), why: z.string() })).max(6),
  watch: z.array(z.string()).max(4).describe("What to check next week."),
});
export type ReplanDraft = z.infer<typeof ReplanDraft>;

/** The share of the remaining budget that may move while every neighbourhood is too early to call. */
export const TEST_SHARE = 0.1;

export function replanProblems(
  k: Pick<ReplanDraft, "moves" | "new_partners">,
  ctx: { budget: ReturnType<typeof remainingBudget>; report: { zones: Pick<ZoneReport, "verdict">[] }; zoneIds: number[]; found: Set<string> },
): string[] {
  const { budget, report } = ctx;
  const problems: string[] = [];
  const fromTotals = new Map<number, number>();
  for (const m of k.moves) {
    const step = budget.byStep[m.from_step];
    if (!step) problems.push(`No action ${m.from_step}.`);
    else fromTotals.set(m.from_step, (fromTotals.get(m.from_step) ?? 0) + m.amount);
    if (m.to_zone_id !== null && !ctx.zoneIds.includes(m.to_zone_id)) problems.push(`Unknown zone ${m.to_zone_id}.`);
  }
  for (const [i, total] of fromTotals) {
    const step = budget.byStep[i];
    if (step && total > step.remaining + 1) problems.push(`Action ${i} ("${step.label}") has $${step.remaining} left, not $${Math.round(total)}.`);
  }
  const moved = k.moves.reduce((t, m) => t + m.amount, 0);
  const callable = report.zones.some((x) => x.verdict !== "too early");
  if (!callable && moved > budget.remaining * TEST_SHARE + 1)
    problems.push(`Every neighbourhood is "too early" to call; keep moves to $${Math.floor(budget.remaining * TEST_SHARE)} or less in total and call them tests.`);
  for (const p of k.new_partners) if (!ctx.found.has(p.place_id)) problems.push(`Place ${p.place_id} didn't come from find_places.`);
  return problems;
}
