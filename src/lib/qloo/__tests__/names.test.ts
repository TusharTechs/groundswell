import { describe, expect, it } from "vitest";
import { plausibleMatch } from "../names";

// Real query → Qloo name pairs observed in the benchmark and edge-case runs.
const accept: [string, string[]][] = [
  ["La Casa de Papel", ["Money Heist", "La casa de papel", "La casa di carta"]], // via Qloo's alternative names
  ["The Joy of Painting", ["The Joy of Painting"]],
  ["Monday Night Football", ["NFL Monday Night Football"]],
  ["Cheesecake Factory", ["The Cheesecake Factory"]],
  ["Air Jordan", ["Air Jordan Product Line"]],
  ["Ruth's Chris", ["Ruth's Chris Steak House"]],
  ["Lo-Lo's Chicken and Waffles", ["Lo-Lo's Chicken & Waffles"]],
  ["North Face", ["The North Face"]],
  ["the Eagles", ["Eagles"]],
  ["Bubba Gump", ["Bubba Gump Shrimp Company"]],
  ["Beyonce", ["Beyoncé"]],
  ["Your Name", ["Your Name."]],
  ["M*A*S*H", ["M*A*S*H"]],
];

const reject: [string, string[]][] = [
  ["Zorblax Quartet", ["Vitamin String Quartet"]],
  ["Zorblax Quartet", ["The Dave Brubeck Quartet"]],
  ["Zorblax Quartet", ["The String Quartet"]],
  ["Coachella", ["Coachella Valley Preserve - Thousand Palms Oasis Preserve"]],
  ["Marie Kondo", ["Taylor Marie Hill"]],
  ["Lost", ["Lost in Space"]],
  ["Top Gun", ["Top Gunner"]],
  ["Bob Ross", ["Bob's Burgers"]], // Qloo's top TV hit for "Bob Ross"
];

describe("Qloo search hit plausibility", () => {
  it.each(accept)("accepts %s", (q, names) => expect(plausibleMatch(q, names)).toBe(true));
  it.each(reject)("rejects %s → %s", (q, names) => expect(plausibleMatch(q, names)).toBe(false));
});
