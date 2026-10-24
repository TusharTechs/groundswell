// The Launch Kit: everything a team needs to run the winning plan. Copy is
// written by the Creative Director agent; links, posters, the ad-targeting
// sheet and the calendar are built in code from the plan.

import { z } from "zod";

export const KitInput = z.object({
  campaignId: z.string().regex(/^[a-z0-9-]{4,64}$/),
  cityId: z.string(),
  title: z.string().max(120),
  pitch: z.string().max(400),
  kind: z.string().max(40),
  /** The language the local copy is written in; other languages get an English translation alongside. */
  language: z.string().max(20).default("English"),
  venue: z.string().max(160).nullable(),
  /** ISO date of launch day. */
  launchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().int().min(7).max(120),
  budget: z.number(),
  allAges: z.boolean(),
  noAlcohol: z.boolean(),
  /** An age limit the brief states, such as "21+"; null when it states none. */
  ageLimit: z.string().max(8).nullable().default(null),
  /** Where tickets or the launch live; optional. */
  launchUrl: z.string().url().max(500).nullable(),
  comps: z.array(z.string().max(80)).max(4),
  /** The comparables' Qloo entity ids, for later Qloo searches (mission control). */
  compIds: z.array(z.string().max(80)).max(4).default([]),
  peakAge: z.string().nullable(),
  tags: z.array(z.string().max(60)).max(10),
  zones: z
    .array(
      z.object({
        id: z.number().int(),
        locality: z.string().max(80),
        district: z.string().max(80),
        /** Probe labels the zone's district leans toward most. */
        signature: z.array(z.string().max(40)).max(6),
        share: z.number(),
        center: z.tuple([z.number(), z.number()]),
        cells: z.array(z.number().int()).max(400),
      }),
    )
    .max(6),
  partners: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().max(120),
        category: z.string().max(60),
        address: z.string().max(200).nullable(),
        phone: z.string().max(40).nullable(),
        website: z.string().max(300).nullable(),
        role: z.string().max(40).nullable(),
        why: z.string().max(300).nullable(),
        zone: z.number().int(),
        affinity: z.number(),
        drivers: z.array(z.string().max(80)).max(4),
        lon: z.number(),
        lat: z.number(),
        /** The plan includes a pop-up here, on this many days before launch. */
        popupDaysBefore: z.number().int().nullable(),
      }),
    )
    .max(30),
  podcasts: z.array(z.object({ name: z.string().max(160), daysBefore: z.number().int() })).max(3),
  brands: z.array(z.object({ name: z.string().max(120) })).max(2),
  /** Dated actions from the plan, for the calendar and the ad sheet. */
  steps: z
    .array(
      z.object({
        kind: z.string(),
        label: z.string().max(200),
        zone: z.number().int().nullable(),
        startDaysBefore: z.number().int(),
        endDaysBefore: z.number().int(),
        cost: z.number(),
      }),
    )
    .max(60),
});
export type KitInput = z.infer<typeof KitInput>;

export interface ZoneCopy {
  zoneId: number;
  references: { name: string; verdict: string; score: number | null }[];
  posterHeadline: string;
  posterSubline: string;
  instagram: string;
  tiktokHook: string;
  tiktokBeats: string[];
  xPost: string;
  /** The same copy in English, when the local language isn't. */
  english?: { posterHeadline: string; posterSubline: string; instagram: string; xPost: string };
}

export interface TrackedLink {
  code: string;
  label: string;
  channel: "poster" | "instagram" | "tiktok" | "x" | "podcast" | "email";
  zone: number | null;
  partnerId?: string;
}

export interface Kit {
  campaignId: string;
  createdAt: string;
  input: KitInput;
  tagline: string;
  /** Two sentences for the launch page, in the city's language. */
  blurb?: string;
  /** Tagline and blurb in English, when the city's language isn't. */
  english?: { tagline: string; blurb: string };
  hashtags: string[];
  zones: ZoneCopy[];
  podcasts: { name: string; script: string; code: string }[];
  partners: { id: string; code: string; subject: string; body: string; english?: { subject: string; body: string } }[];
  links: TrackedLink[];
  /** Every reference the Creative Director checked on Qloo, with its verdict per zone. */
  checks: { name: string; type: string; zone: number; verdict: string; score: number | null; query?: string }[];
  qlooCalls: number;
}
