// Is a Qloo search hit plausibly the entity we asked for? Qloo search always
// returns its closest results, so a made-up or unlisted name ("Zorblax
// Quartet") comes back as a real but unrelated entity ("Vitamin String
// Quartet"). Scoring that would be confidently wrong, so we only accept hits
// whose name, or one of Qloo's alternative names, matches the query.

// Words that describe a kind of thing rather than name it.
const GENERIC = new Set([
  "the", "a", "an", "of", "and", "in", "on", "at", "de", "la", "el", "los", "las", "le",
  "band", "quartet", "trio", "orchestra", "ensemble", "choir", "group", "music",
  "show", "series", "tv", "movie", "film", "the movie", "podcast",
  "restaurant", "cafe", "bar", "grill", "steak", "house", "kitchen", "company", "co", "inc", "brand",
  "club", "festival", "product", "line",
]);

export function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]s\b/g, "s")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const tokens = (s: string) => normName(s).split(" ").filter(Boolean);
const distinctive = (s: string) => tokens(s).filter((t) => !GENERIC.has(t));

function bigrams(s: string) {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice similarity on character bigrams, 0–1. */
export function dice(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.length || !y.length) return a === b ? 1 : 0;
  const counts = new Map<string, number>();
  for (const g of x) counts.set(g, (counts.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of y) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      hits++;
      counts.set(g, c - 1);
    }
  }
  return (2 * hits) / (x.length + y.length);
}

const close = (a: string, b: string) => a === b || (a.length > 3 && b.length > 3 && dice(a, b) >= 0.8);

/**
 * Every distinctive word of `small` appears in `big`, which adds at most two
 * distinctive words, or none at all when `small` is a single word ("Lost" is
 * not "Lost in Space").
 */
function covers(big: string, small: string) {
  const s = distinctive(small);
  const b = distinctive(big);
  if (!s.length) return false;
  const matched = s.every((w) => b.some((v) => close(v, w)));
  return matched && b.length - s.length <= (s.length === 1 ? 0 : 2);
}

export function plausibleMatch(query: string, names: string[]): boolean {
  const q = normName(query).replace(/^the /, "");
  return names.some((raw) => {
    const n = normName(raw).replace(/^the /, "");
    if (!n || !q) return false;
    if (n === q || dice(n, q) >= 0.85) return true;
    return covers(n, q) || covers(q, n);
  });
}
