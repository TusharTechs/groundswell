"use client";

// Mission control: a running campaign's tracked-link scans on the city map,
// each neighbourhood against what the rehearsal expected, and the Field
// Analyst's re-plan of the budget not yet spent.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PartnerView } from "@/lib/agents/events";
import type { CityAtlas } from "@/lib/atlas/types";
import type { AnalystEvent, Replan } from "@/lib/campaign/analyst";
import { remainingBudget, scanReport, type Verdict } from "@/lib/campaign/report";
import { linkUrl, prettyDate } from "@/lib/kit/build";
import type { Kit } from "@/lib/kit/types";
import type { Scan } from "@/lib/store";
import { AgentIcon } from "../rehearsal/agents";

const CityMap = dynamic(() => import("../city-map"), { ssr: false, loading: () => <div className="absolute inset-0 animate-pulse bg-panel" /> });

const CHANNEL: Record<string, string> = { poster: "Posters", instagram: "Instagram", tiktok: "TikTok or Reels", x: "X or Threads", podcast: "Podcast reads", email: "Partner emails" };
const VERDICT: Record<Verdict, string> = { ahead: "bg-hot/15 text-hot", behind: "bg-[#5696ff]/15 text-[#8fb6ff]", "on track": "bg-glow/15 text-glow", "too early": "bg-panel-3 text-dim" };

type Data = { scans: Scan[]; replan: Replan | null; store: "postgres" | "memory" };

export function MissionControl({ kit, demo, cityName }: { kit: Kit; demo: boolean; cityName: string }) {
  const id = kit.campaignId;
  const [atlas, setAtlas] = useState<CityAtlas | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<"simulate" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyst, setAnalyst] = useState<{ running: boolean; steps: string[]; error?: string }>({ running: false, steps: [] });
  const [qr, setQr] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    fetch(`/api/atlas/${kit.input.cityId}`)
      .then((r) => r.json())
      .then(setAtlas)
      .catch(() => undefined);
  }, [kit.input.cityId]);

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/campaign/${id}`, { cache: "no-store" });
    if (r.ok) setData(await r.json());
  }, [id]);

  // Poll while the page is visible, so a scan from a phone shows up within seconds.
  useEffect(() => {
    refresh();
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  // A QR code for the first partner's poster link, to scan with a phone.
  const posterLink = kit.links.find((l) => l.channel === "poster") ?? kit.links[0];
  useEffect(() => {
    if (!origin || !posterLink) return;
    import("qrcode").then((QR) => QR.toString(linkUrl(origin, id, posterLink.code), { type: "svg", margin: 1, color: { dark: "#07080d", light: "#ffffff" } }).then(setQr));
  }, [origin, id, posterLink]);

  const scans = useMemo(() => data?.scans ?? [], [data]);
  const report = useMemo(() => scanReport(kit, scans), [kit, scans]);
  const budget = useMemo(() => remainingBudget(kit, report.today), [kit, report.today]);

  // Per cell: how much of the scans its neighbourhood brought, and against expectation.
  const { share, ratio } = useMemo(() => {
    const n = atlas?.cells.length ?? 0;
    const share = new Float32Array(n);
    const ratio = new Float32Array(n).fill(NaN);
    const max = Math.max(1, ...report.zones.map((z) => z.observed / Math.max(1, kit.input.zones.find((x) => x.id === z.zoneId)?.cells.length ?? 1)));
    for (const z of report.zones) {
      const cells = kit.input.zones.find((x) => x.id === z.zoneId)?.cells ?? [];
      for (const i of cells) {
        if (i >= n) continue;
        share[i] = z.observed / Math.max(1, cells.length) / max;
        ratio[i] = z.ratio ?? 1;
      }
    }
    return { share, ratio };
  }, [atlas, report, kit]);

  const cellZone = useMemo(() => {
    const m = new Map<number, (typeof report.zones)[number]>();
    for (const z of report.zones) for (const i of kit.input.zones.find((x) => x.id === z.zoneId)?.cells ?? []) m.set(i, z);
    return m;
  }, [report, kit]);

  const partners: PartnerView[] = useMemo(
    () =>
      kit.input.partners.map((p, i) => {
        const n = report.links.find((l) => l.code === `p${i + 1}`)?.observed ?? 0;
        return {
          id: p.id,
          name: p.name,
          category: `${p.category} · ${n} poster scan${n === 1 ? "" : "s"}`,
          address: p.address ?? undefined,
          lon: p.lon,
          lat: p.lat,
          zone: p.zone,
          cell: 0,
          affinity: p.affinity,
          drivers: [],
        };
      }),
    [kit, report],
  );

  const act = async (kind: "simulate" | "reset") => {
    setBusy(kind);
    setError(null);
    try {
      const r = await fetch(`/api/campaign/${id}/simulate`, { method: kind === "simulate" ? "POST" : "DELETE" });
      if (!r.ok) setError((await r.json().catch(() => ({})))?.error ?? "That didn't work.");
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const runAnalyst = async () => {
    setAnalyst({ running: true, steps: [] });
    try {
      const res = await fetch(`/api/campaign/${id}/analyst`, { method: "POST" });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({})))?.error ?? "The Field Analyst couldn't start.");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const line = buf
            .slice(0, i)
            .split("\n")
            .find((l) => l.startsWith("data: "));
          buf = buf.slice(i + 2);
          if (!line) continue;
          const e = JSON.parse(line.slice(6)) as AnalystEvent;
          if (e.type === "analyst-step") setAnalyst((a) => ({ ...a, steps: [...a.steps, e.text] }));
          else if (e.type === "analyst-places") setAnalyst((a) => ({ ...a, steps: [...a.steps, `Searched Qloo for partner places in ${e.zone}: ${e.found} suitable`] }));
          else if (e.type === "replan") setData((d) => (d ? { ...d, replan: e.replan } : d));
          else if (e.type === "error") throw new Error(e.message);
        }
      }
      setAnalyst((a) => ({ ...a, running: false }));
    } catch (e) {
      setAnalyst((a) => ({ ...a, running: false, error: (e as Error).message }));
    }
  };

  // Frame the plan's neighbourhoods rather than the whole city.
  const focus = useMemo<[number, number, number] | null>(() => {
    if (!atlas || !kit.input.zones.length) return null;
    const lon = kit.input.zones.reduce((t, z) => t + z.center[0], 0) / kit.input.zones.length;
    const lat = kit.input.zones.reduce((t, z) => t + z.center[1], 0) / kit.input.zones.length;
    // Closer together, closer in: the farthest pair of neighbourhoods sets the zoom.
    const km = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 111 * Math.cos((lat * Math.PI) / 180), (a[1] - b[1]) * 111);
    const spread = Math.max(0, ...kit.input.zones.flatMap((a) => kit.input.zones.map((b) => km(a.center, b.center))));
    return [lon, lat, atlas.city.zoom + (spread < 5 ? 2.6 : spread < 10 ? 2 : 1.4)];
  }, [atlas, kit]);

  const daysToLaunch = Math.round((new Date(`${kit.input.launchDate}T12:00:00Z`).getTime() - Date.now()) / 86_400_000);
  const maxDay = Math.max(1, ...report.byDay.map((d) => d.real + d.simulated));
  const topLinks = [...report.links]
    .filter((l) => l.observed > 0)
    .sort((a, b) => b.observed - a.observed)
    .slice(0, 8);
  const maxChannel = Math.max(1, ...report.channels.map((c) => c.observed));
  const replan = data?.replan ?? null;
  const stale = replan && replan.basis.total !== report.total;

  return (
    <main className="mx-auto max-w-[1400px] space-y-5 px-4 pt-6 pb-16 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cool">Mission control · {cityName}</p>
          <h1 className="mt-1 font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{kit.input.title}</h1>
          <p className="mt-1 text-[14px] text-muted">
            Launch {prettyDate(kit.input.launchDate)}
            {daysToLaunch > 0 ? ` · ${daysToLaunch} days to go` : ""} · {kit.links.length} tracked links · ${kit.input.budget.toLocaleString()} plan
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[12.5px]">
          <Link href={`/l/${id}`} className="rounded-full border border-line px-3 py-1.5 hover:border-text">
            Launch page
          </Link>
          {(demo || id.startsWith("run-")) && (
            <Link href={`/rehearse/${id}`} className="rounded-full border border-line px-3 py-1.5 hover:border-text">
              The rehearsal behind it
            </Link>
          )}
        </div>
      </header>

      {(demo || report.simulated > 0) && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-[13px] text-warn">
          {demo ? "A demo campaign from a recorded rehearsal: the launch is fictional. " : ""}
          {report.simulated > 0
            ? `${report.simulated} of the ${report.total} scans are simulated: drawn around the rehearsal's expectation with one neighbourhood set to fall short and one to beat it, to show how mission control and the Field Analyst respond. They are not real data.`
            : "Scans here are real visits to the campaign's tracked links. Simulate a week to see how mission control and the Field Analyst respond."}
        </div>
      )}
      {data?.store === "memory" && <p className="text-[12px] text-dim">This server keeps scans in memory (no database configured), so they can reset when it restarts.</p>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Scans" value={report.total.toLocaleString()} note={`${report.real} real · ${report.simulated} simulated`} accent />
        <Kpi label="Campaign day" value={report.total ? `${report.today + 1} of ${kit.input.days}` : "—"} note={report.total ? "the latest day with scans" : "no scans yet"} />
        <Kpi
          label="Neighbourhoods"
          value={`${report.zones.filter((z) => z.verdict === "ahead").length} ahead · ${report.zones.filter((z) => z.verdict === "behind").length} behind`}
          note={report.zones.every((z) => z.verdict === "too early") ? "too early to call" : "two standard errors or more"}
        />
        <Kpi label="Budget not yet spent" value={`$${budget.remaining.toLocaleString()}`} note={`of $${kit.input.budget.toLocaleString()}, if spend is even across each action's days`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="space-y-4">
          <div className="relative h-[52vh] min-h-[340px] overflow-hidden rounded-2xl border border-line">
            {atlas && (
              <CityMap
                atlas={atlas}
                mode="scans"
                scanShare={share}
                scanRatio={ratio}
                cellNote={(i) => {
                  const z = cellZone.get(i);
                  return z ? `<div>${z.observed} scans vs ${z.expected.toFixed(1)} expected</div><div style="color:#a3aac0">${z.verdict}</div>` : null;
                }}
                partners={partners}
                venue={null}
                focus={focus}
                className="absolute inset-0"
              />
            )}
            <div className="glass pointer-events-none absolute bottom-3 left-3 rounded-xl border border-line px-3 py-2 text-[11px] text-muted">
              <div className="mb-1 font-semibold text-text">Scans against the rehearsal</div>
              <div className="h-1.5 w-44 rounded-full" style={{ background: "linear-gradient(90deg,#5696ff,#ffb547,#ff5c8a)" }} />
              <div className="mt-1 flex justify-between gap-6">
                <span>Behind</span>
                <span>On track</span>
                <span>Ahead</span>
              </div>
              <div className="mt-1 text-dim">Height: scans. Dots: partner places.</div>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-panel p-4">
            <H>Each neighbourhood against expectation</H>
            <ul className="space-y-3">
              {report.zones.map((z) => (
                <li key={z.zoneId} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-[12.5px]">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{z.locality}</div>
                    <div className="truncate text-[11px] text-dim">{z.district}</div>
                  </div>
                  <div className="space-y-1">
                    <Bar
                      value={report.total - report.cityWide ? z.observed / (report.total - report.cityWide) : 0}
                      max={Math.max(0.01, ...report.zones.map((x) => Math.max(x.expectedShare, report.total - report.cityWide ? x.observed / (report.total - report.cityWide) : 0)))}
                      className="bg-gradient-to-r from-glow to-hot"
                    />
                    <Bar
                      value={z.expectedShare}
                      max={Math.max(0.01, ...report.zones.map((x) => Math.max(x.expectedShare, report.total - report.cityWide ? x.observed / (report.total - report.cityWide) : 0)))}
                      className="bg-[#5b6280]"
                      thin
                    />
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${VERDICT[z.verdict]}`}>{z.verdict}</span>
                    <span className="font-mono text-[11px] text-muted">
                      {z.observed} / {z.expected.toFixed(0)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-dim">
              Thick bar: share of scans. Thin bar: the share the rehearsal expects, from each neighbourhood&apos;s share of the natural audience on Qloo. A neighbourhood is ahead or behind when the
              gap is at least two standard errors, and too early to call before 30 scans.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-line bg-panel p-4">
            <H>Try it</H>
            <div className="flex gap-4">
              {qr && <div className="w-28 shrink-0 rounded-xl bg-white p-1.5" aria-label="QR code for a partner poster's tracked link" role="img" dangerouslySetInnerHTML={{ __html: qr }} />}
              <div className="space-y-2 text-[13px] text-muted">
                <p>
                  Scan this code with a phone: it is the tracked link on the poster at <span className="text-text">{kit.input.partners[0]?.name ?? "the first partner"}</span>. The scan shows up here
                  within a few seconds.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => act("simulate")}
                    className="rounded-full bg-text px-3.5 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-glow disabled:opacity-60"
                  >
                    {busy === "simulate" ? "Simulating…" : report.simulated ? "Simulate the next week" : "Simulate a week"}
                  </button>
                  {report.simulated > 0 && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => act("reset")}
                      className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] hover:border-text disabled:opacity-60"
                    >
                      {busy === "reset" ? "Resetting…" : "Reset the simulation"}
                    </button>
                  )}
                </div>
                {error && <p className="text-[12.5px] text-bad">{error}</p>}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-cool/30 bg-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
              <AgentIcon agent="field" />
              <H>Field Analyst</H>
            </div>
              <button
                type="button"
                disabled={analyst.running || !report.total}
                onClick={runAnalyst}
                className="-mt-2 rounded-full bg-gradient-to-r from-cool to-[#56b4ff] px-3.5 py-1.5 text-[12.5px] font-semibold text-ink disabled:opacity-50"
              >
                {analyst.running ? "Re-planning…" : replan ? "Re-plan again" : "Re-plan the budget"}
              </button>
            </div>
            <p className="text-[12.5px] text-muted">
              An agent reads the scans against the rehearsal, searches Qloo for new partner places where a neighbourhood is behind, and moves the budget not yet spent. Its moves are checked against
              what is actually left.
            </p>
            {analyst.steps.length > 0 && (
              <ul className="mt-2 space-y-1 text-[12px] text-dim">
                {analyst.steps.map((s, i) => (
                  <li key={i} className="rise-in">
                    · {s}
                  </li>
                ))}
                {analyst.running && <li className="h-1.5 w-24 rounded-full shimmer" />}
              </ul>
            )}
            {analyst.error && <p className="mt-2 text-[12.5px] text-bad">{analyst.error}</p>}
            {replan && (
              <div className="mt-3 space-y-3">
                <p className="text-[14px] leading-relaxed text-text/90">{replan.summary}</p>
                {replan.moves.length > 0 && (
                  <ul className="space-y-2">
                    {replan.moves.map((m, i) => (
                      <li key={i} className="rounded-xl border border-line bg-panel-2 p-2.5 text-[12.5px]">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span>
                            <span className="text-muted">{m.from}</span> <span className="text-dim">→</span> <span className="font-semibold">{m.to}</span>
                          </span>
                          <span className="font-mono text-cool">${m.amount.toLocaleString()}</span>
                        </div>
                        <div className="mt-0.5 text-dim">{m.why}</div>
                      </li>
                    ))}
                  </ul>
                )}
                {replan.partners.length > 0 && (
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">New partner places (from Qloo)</div>
                    <ul className="space-y-1.5 text-[12.5px]">
                      {replan.partners.map((p) => (
                        <li key={p.name}>
                          <span className="font-semibold">{p.name}</span>{" "}
                          <span className="text-dim">
                            ({p.category}, {p.zone})
                          </span>{" "}
                          <span className="text-muted">{p.why}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {replan.watch.length > 0 && (
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">Check next</div>
                    <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] text-muted marker:text-dim">
                      {replan.watch.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[11px] text-dim">
                  Based on {replan.basis.total} scans ({replan.basis.simulated} simulated) up to campaign day {replan.basis.day + 1}; ${replan.remaining.toLocaleString()} was left to move.
                  {stale ? " New scans have arrived since; re-plan to include them." : ""} Written by Claude; {replan.qlooCalls} new Qloo requests.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-panel p-4">
            <H>By channel</H>
            <ul className="space-y-1.5">
              {report.channels.map((c) => (
                <li key={c.channel} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-2 text-[12px]">
                  <span className="text-muted">{CHANNEL[c.channel]}</span>
                  <Bar value={c.observed} max={maxChannel} className="bg-cool/80" />
                  <span className="text-right font-mono">{c.observed}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-line bg-panel p-4">
            <H>By day</H>
            {report.byDay.length ? (
              <div className="flex h-24 items-end gap-[3px]" role="img" aria-label="Scans per campaign day">
                {Array.from({ length: report.today + 1 }, (_, d) => {
                  const v = report.byDay.find((x) => x.day === d);
                  const real = v?.real ?? 0;
                  const sim = v?.simulated ?? 0;
                  return (
                    <div key={d} className="flex flex-1 flex-col justify-end" title={`Day ${d + 1}: ${real} real, ${sim} simulated`}>
                      <div className="rounded-t-sm bg-[#5b6280]" style={{ height: `${(sim / maxDay) * 100}%` }} />
                      <div className="bg-glow" style={{ height: `${(real / maxDay) * 100}%` }} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[12.5px] text-dim">No scans yet.</p>
            )}
            <p className="mt-1.5 text-[11px] text-dim">Amber: real scans. Grey: simulated.</p>
          </div>

          {topLinks.length > 0 && (
            <div className="rounded-2xl border border-line bg-panel p-4">
              <H>Best links</H>
              <ul className="divide-y divide-line text-[12.5px]">
                {topLinks.map((l) => (
                  <li key={l.code} className="flex justify-between gap-3 py-1.5">
                    <span className="truncate text-muted">{l.label}</span>
                    <span className="font-mono">{l.observed}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">{children}</h2>;
}

function Bar({ value, max, className, thin }: { value: number; max: number; className: string; thin?: boolean }) {
  return (
    <div className={`${thin ? "h-1" : "h-2"} rounded-full bg-panel-3`}>
      <div className={`${thin ? "h-1" : "h-2"} rounded-full ${className}`} style={{ width: `${Math.min(100, (value / Math.max(1e-9, max)) * 100)}%` }} />
    </div>
  );
}

function Kpi({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? "border-cool/40 bg-cool/5" : "border-line bg-panel"}`}>
      <div className="text-[11px] leading-tight text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
      {note && <div className="mt-0.5 text-[11px] text-dim">{note}</div>}
    </div>
  );
}
