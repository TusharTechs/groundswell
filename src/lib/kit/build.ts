// The parts of the Launch Kit built in code: tracked links, the ad-targeting
// sheet, the calendar file and dates. Pure, so the browser can use them too.

import type { Kit, KitInput, TrackedLink } from "./types";

const DAY_MS = 86_400_000;

/** Calendar date of an action this many days before launch. */
export function dateBefore(launchDate: string, daysBefore: number): Date {
  return new Date(new Date(`${launchDate}T12:00:00Z`).getTime() - daysBefore * DAY_MS);
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function prettyDate(launchDate: string, daysBefore = 0) {
  return dateBefore(launchDate, daysBefore).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/** One tracked code per partner poster, per zone and channel, and per podcast. */
export function trackedLinks(input: KitInput): TrackedLink[] {
  const links: TrackedLink[] = [];
  input.partners.forEach((p, i) => links.push({ code: `p${i + 1}`, label: `Poster at ${p.name}`, channel: "poster", zone: p.zone, partnerId: p.id }));
  input.partners.forEach((p, i) => links.push({ code: `e${i + 1}`, label: `Email to ${p.name}`, channel: "email", zone: p.zone, partnerId: p.id }));
  for (const z of input.zones) {
    links.push({ code: `z${z.id}ig`, label: `Instagram, ${z.locality}`, channel: "instagram", zone: z.id });
    links.push({ code: `z${z.id}tt`, label: `TikTok or Reels, ${z.locality}`, channel: "tiktok", zone: z.id });
    links.push({ code: `z${z.id}x`, label: `X or Threads, ${z.locality}`, channel: "x", zone: z.id });
  }
  input.podcasts.forEach((p, i) => links.push({ code: `pod${i + 1}`, label: `Host-read on ${p.name}`, channel: "podcast", zone: null }));
  return links;
}

export const linkUrl = (origin: string, campaignId: string, code: string) => `${origin.replace(/\/$/, "")}/go/${campaignId}/${code}`;

const AGE: Record<string, string> = {
  "24_and_younger": "18-24",
  "25_to_29": "25-29",
  "30_to_34": "30-34",
  "35_to_44": "35-44",
  "45_to_54": "45-54",
  "55_and_older": "55+",
};

const csvCell = (v: string | number | null | undefined) => `"${String(v ?? "").replaceAll('"', '""')}"`;
export const toCsv = (rows: (string | number | null | undefined)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n");

/**
 * A targeting brief per hot zone for interest-targeted social ads: where
 * (centre and radius), who (comparables and Qloo tags as interests, the age
 * band the fans skew to), when and how much (from the plan's ad actions).
 * It is a brief to set up by hand in an ads manager, not an upload format.
 */
export function targetingSheet(input: KitInput): string {
  const header = ["zone", "district", "latitude", "longitude", "radius_km", "interests", "age_band", "start_date", "end_date", "budget_usd", "note"];
  const rows = input.zones.map((z) => {
    const ads = input.steps.filter((s) => s.kind === "social" && (s.zone === z.id || s.zone === null));
    const start = ads.length ? Math.max(...ads.map((s) => s.startDaysBefore)) : null;
    const end = ads.length ? Math.min(...ads.map((s) => s.endDaysBefore)) : null;
    const zoneBudget = ads.filter((s) => s.zone === z.id).reduce((t, s) => t + s.cost, 0);
    const cityBudget = ads.filter((s) => s.zone === null).reduce((t, s) => t + s.cost, 0) * z.share;
    return [
      z.locality,
      z.district,
      z.center[1].toFixed(5),
      z.center[0].toFixed(5),
      "1.6",
      [...input.comps, ...input.tags.slice(0, 3)].join("; "),
      input.peakAge ? (AGE[input.peakAge] ?? "") : "",
      start !== null ? isoDate(dateBefore(input.launchDate, start)) : "",
      end !== null ? isoDate(dateBefore(input.launchDate, end)) : "",
      Math.round(zoneBudget + cityBudget),
      ads.length ? (zoneBudget ? "Zone ads in the plan" : "Share of the plan's city-wide ads, by this zone's audience") : "No ads in the plan for this zone",
    ];
  });
  return toCsv([header, ...rows]);
}

function icsDate(d: Date) {
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

function icsText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** An iCalendar file with every dated action in the plan, plus partner set-up and launch day. */
export function calendar(input: KitInput, kit: Pick<Kit, "campaignId">): string {
  const events: { start: Date; end: Date; title: string; detail: string }[] = [];
  const allDay = (daysBefore: number, endDaysBefore = daysBefore) => ({
    start: dateBefore(input.launchDate, daysBefore),
    end: new Date(dateBefore(input.launchDate, endDaysBefore).getTime() + DAY_MS),
  });
  if (input.partners.length)
    events.push({
      ...allDay(input.days - 1),
      title: "Put up posters and drop flyers at partner places",
      detail: input.partners.map((p) => `${p.name}${p.address ? `, ${p.address}` : ""}`).join("\n"),
    });
  for (const s of input.steps) {
    if (s.kind === "partner") continue;
    events.push({ ...allDay(s.startDaysBefore, s.endDaysBefore), title: s.label, detail: `From the Groundswell plan. Budget $${s.cost.toLocaleString()}.` });
  }
  events.push({ ...allDay(0), title: `Launch day: ${input.title}`, detail: input.venue ?? input.pitch });
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Groundswell//Launch plan//EN", "CALSCALE:GREGORIAN"];
  events.forEach((e, i) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${kit.campaignId}-${i}@groundswell`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;VALUE=DATE:${icsDate(e.start)}`,
      `DTEND;VALUE=DATE:${icsDate(e.end)}`,
      `SUMMARY:${icsText(e.title)}`,
      `DESCRIPTION:${icsText(e.detail)}`,
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/** Replace the {link} placeholder in a piece of copy with a tracked link. */
export const withLink = (text: string, url: string) => text.replaceAll("{link}", url);
