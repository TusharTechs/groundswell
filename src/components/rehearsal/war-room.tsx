"use client";

// The war room: the living city in the middle, the team and the brief on the
// left, the team's reasoning on the right, and every plan they rehearsed at the
// bottom, with a scrubber that plays the campaign day by day on the map.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LaunchEvent } from "@/lib/agents/events";
import { CITIES } from "@/lib/atlas/cities";
import type { CityAtlas } from "@/lib/atlas/types";
import type { MapMode } from "../city-map";
import { TeamRoster, TeamStrip } from "./agents";
import { Feed } from "./feed";
import { Leaderboard } from "./leaderboard";
import { SearchSpace } from "./search-space";
import { PlanSheet } from "./plan-sheet";
import { Timeline } from "./timeline";
import { decodeBytes, streamLive, useReplay, useRunView } from "./use-run";
import { WhatIf, type WhatIfResult } from "./what-if";

const CityMap = dynamic(() => import("../city-map"), { ssr: false, loading: () => <div className="absolute inset-0 animate-pulse bg-panel" /> });

export type Source =
  | { kind: "replay"; id: string; cityId: string; events: { t: number; e: LaunchEvent }[]; recordedAt: string }
  | { kind: "live"; input: { brief: string; cityId: string; budget?: number; days?: number } };

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function WarRoom({ source }: { source: Source }) {
  const cityId = source.kind === "replay" ? source.cityId : source.input.cityId;
  const city = CITIES.find((c) => c.id === cityId)!;
  const [atlas, setAtlas] = useState<CityAtlas | null>(null);
  const { view, feed } = useRunView();
  const replay = useReplay(source.kind === "replay" ? source.events : null, feed);
  const started = useRef(false);
  const [showPlan, setShowPlan] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [whatIf, setWhatIf] = useState<WhatIfResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [panel, setPanel] = useState<"plans" | "search">("plans");

  useEffect(() => {
    let alive = true;
    fetch(`/api/atlas/${cityId}`)
      .then((r) => r.json())
      .then((a: CityAtlas) => alive && setAtlas(a))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [cityId]);

  // Start the live run once. It isn't aborted on unmount: React may simulate an
  // unmount in development, and a run that has started is worth finishing.
  useEffect(() => {
    if (source.kind !== "live" || started.current) return;
    started.current = true;
    streamLive(source.input, feed, new AbortController().signal).catch(() => feed({ type: "error", message: "The connection to the rehearsal dropped." }));
  }, [source, feed]);

  // Follow the latest results: the plan when it arrives, else the best plan so far.
  const best = useMemo(() => {
    const ids = Object.keys(view.sims);
    return ids.sort((a, b) => view.sims[b].metrics.reach.mean - view.sims[a].metrics.reach.mean)[0];
  }, [view.sims]);
  const winner = view.plan?.plan.strategyId;
  useEffect(() => {
    if (winner) setSelected(winner);
    else if (best) setSelected(best);
  }, [winner, best]);
  useEffect(() => {
    if (view.plan) setShowPlan(true);
  }, [view.plan]);

  const sim = selected ? view.sims[selected] : undefined;
  const simFrames = useMemo(() => (sim ? sim.frames.data.map(decodeBytes) : []), [sim]);
  // An edited plan from "Try a change" takes over the map until it is reset.
  const frames = whatIf ? whatIf.frames : simFrames;
  const frameDays = whatIf ? whatIf.frameDays : (sim?.frames.days ?? []);
  useEffect(() => {
    if (!frames.length) return;
    setFrame(0);
    setPlaying(true);
  }, [frames]);
  useEffect(() => {
    if (!playing || !frames.length) return;
    const id = setInterval(() => {
      setFrame((f) => {
        if (f >= frames.length - 1) {
          setPlaying(false);
          return f;
        }
        return f + 1;
      });
    }, 240);
    return () => clearInterval(id);
  }, [playing, frames]);

  // A live run shows how long the team has been at it.
  useEffect(() => {
    if (source.kind !== "live" || view.done || view.error) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [source.kind, view.done, view.error]);

  const mode: MapMode = sim ? "sim" : view.fit ? "fit" : "districts";
  const fit = useMemo(() => (view.fit ? Array.from(view.fit.fit, (b) => b / 255) : null), [view.fit]);
  const spec = view.spec;
  const live = source.kind === "live" ? !view.done && !view.error : replay.playing;
  const strategy = view.strategies.find((s) => s.id === selected);

  return (
    <div className="relative min-h-dvh lg:h-dvh lg:overflow-hidden">
      <div className="relative h-[58vh] lg:absolute lg:inset-0 lg:h-auto">
        {atlas && (
          <CityMap
            atlas={atlas}
            mode={mode}
            fit={fit}
            adoption={frames[frame] ?? null}
            zones={view.zones}
            partners={view.partners}
            venue={view.fit?.venue}
            voices={view.voices}
            showArcs
            autoRotate={!view.fit}
            className="absolute inset-0"
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-ink to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink/90 to-transparent lg:hidden" />
        <MapLegend mode={mode} />
      </div>

      {/* Left: brief and team */}
      <aside className="relative z-10 space-y-3 p-3 lg:absolute lg:top-16 lg:left-4 lg:w-[330px] lg:p-0">
        <div className="glass rounded-2xl border border-line p-4">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">
            <span className="truncate">
              {source.kind === "replay" ? "Recorded" : "Live"} · {city.name}
            </span>
            {source.kind === "replay" && !replay.finished && (
              <button type="button" onClick={replay.skip} className="shrink-0 rounded-full border border-line px-2.5 py-0.5 text-[11px] font-medium tracking-normal whitespace-nowrap text-muted normal-case hover:border-text hover:text-text">
                Skip to the plan
              </button>
            )}
          </div>
          <h1 className="font-display text-xl leading-tight font-semibold">{spec?.title ?? "Reading the brief…"}</h1>
          <p className="mt-1 text-[13px] leading-snug text-muted">{spec?.pitch ?? view.brief ?? (source.kind === "live" ? source.input.brief : "")}</p>
          {spec && (
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              <Chip>${spec.budget.toLocaleString()}</Chip>
              <Chip>{spec.days} days</Chip>
              {spec.venue && <Chip>{spec.venue}</Chip>}
              {spec.constraints.allAges && <Chip>All ages</Chip>}
              {(view.taste?.comps ?? spec.comps).map((c) => (
                <Chip key={c.name} tone="cool">
                  {displayName(c.name)}
                </Chip>
              ))}
            </div>
          )}
        </div>
        <div className="glass hidden rounded-2xl border border-line p-2 lg:block">
          {view.baseline || view.strategies.length ? (
            <div className="p-1">
              <TeamStrip agents={view.agents} active={view.active} finished={Boolean(view.plan || view.done)} />
            </div>
          ) : (
            <TeamRoster agents={view.agents} active={view.active} />
          )}
        </div>
      </aside>

      {/* Right: reasoning feed, or the plan */}
      <section className="relative z-10 p-3 lg:absolute lg:top-16 lg:right-4 lg:bottom-4 lg:flex lg:w-[min(560px,40vw)] lg:flex-col lg:p-0">
        {showPlan && view.plan ? (
          <div className="glass scroll-thin rounded-2xl border border-line p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <PlanSheet
              plan={view.plan.plan}
              sim={view.plan.sim}
              baseline={view.baseline}
              strategy={view.strategies.find((s) => s.id === view.plan!.plan.strategyId)}
              spec={spec}
              voices={view.voices}
              qloo={view.qloo}
              cityName={city.name}
              onClose={() => setShowPlan(false)}
              expansion={view.expansion}
            >
              {atlas && fit && view.zones && view.partners && view.media && view.candidates && spec && view.strategies.find((s) => s.id === view.plan!.plan.strategyId) && (
                <WhatIf
                  atlas={atlas}
                  fit={fit}
                  venue={view.fit?.venue}
                  zones={view.zones}
                  partners={view.partners}
                  media={view.media}
                  brandHeat={view.brandHeat}
                  candidates={view.candidates}
                  strategy={view.strategies.find((s) => s.id === view.plan!.plan.strategyId)!}
                  plan={view.plan.sim}
                  baseline={view.baseline}
                  days={spec.days}
                  budget={spec.budget}
                  onResult={setWhatIf}
                />
              )}
            </PlanSheet>
          </div>
        ) : (
          <div className="glass flex flex-col rounded-2xl border border-line p-4 lg:min-h-0 lg:flex-1">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">The team at work</h2>
              <span className="font-mono text-[11px] text-cool">
                {source.kind === "live" && !view.done ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")} · ` : ""}
                {view.qloo.length} Qloo requests
              </span>
            </div>
            <div className="flex max-h-[60vh] min-h-0 flex-1 flex-col lg:max-h-none">
              <Feed items={view.feed} live={live} />
            </div>
            {view.plan && (
              <button type="button" onClick={() => setShowPlan(true)} className="mt-3 rounded-full bg-gradient-to-r from-glow to-hot px-4 py-2 text-[13px] font-semibold text-ink">
                Open the plan
              </button>
            )}
            {source.kind === "replay" && replay.finished && (
              <Link href="/" className="mt-2 text-center text-[13px] text-cool underline-offset-2 hover:underline">
                This was a recorded rehearsal. Rehearse your own launch →
              </Link>
            )}
            {view.error && (
              <div className="mt-3 rounded-xl border border-bad/40 bg-bad/10 p-3 text-[13px]">
                {view.error}{" "}
                <Link href="/rehearse/chicago-headline" className="text-cool underline">
                  Watch a recorded rehearsal
                </Link>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Bottom: plans and the campaign timeline */}
      {(view.baseline || view.strategies.length > 0) && (
        <section className="relative z-10 p-3 lg:absolute lg:bottom-4 lg:left-4 lg:w-[min(640px,calc(100vw-40vw-4rem))] lg:p-0">
          <div className="glass space-y-3 rounded-2xl border border-line p-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">
                {panel === "plans" ? "Plans rehearsed · reach of the natural audience by launch day" : "The Strategist's search · cost against reach"}
              </h2>
              <div className="flex shrink-0 rounded-full border border-line p-0.5 text-[11px]" role="tablist" aria-label="Results view">
                {(["plans", "search"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={panel === k}
                    onClick={() => setPanel(k)}
                    className={`rounded-full px-2.5 py-0.5 ${panel === k ? "bg-text text-ink" : "text-muted hover:text-text"}`}
                  >
                    {k === "plans" ? `Plans · ${view.rounds} round${view.rounds === 1 ? "" : "s"}` : `Search · ${view.probes.length}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="scroll-thin max-h-[30vh] overflow-y-auto">
              {panel === "plans" ? (
                <Leaderboard strategies={view.strategies} sims={view.sims} baseline={view.baseline} selected={selected} onSelect={setSelected} winner={winner} />
              ) : (
                <SearchSpace probes={view.probes} strategies={view.strategies} sims={view.sims} baseline={view.baseline} budget={spec?.budget ?? 0} winner={winner} />
              )}
            </div>
            {sim && spec && (
              <Timeline
                days={spec.days}
                frameDays={frameDays}
                frame={frame}
                onFrame={(i) => {
                  setPlaying(false);
                  setFrame(i);
                }}
                playing={playing}
                onToggle={() => {
                  if (!playing && frame >= frames.length - 1) setFrame(0);
                  setPlaying((p) => !p);
                }}
                label={
                  whatIf
                    ? `Your edited plan · ${pct(whatIf.metrics.reach.mean)} reached by launch`
                    : `${selected}${strategy ? ` “${strategy.name}”` : ""} · ${pct(sim.metrics.reach.mean)} reached by launch`
                }
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/** Qloo sometimes stores names in lower case ("omar apollo"); show them in title case. */
export function displayName(name: string) {
  return name === name.toLowerCase() ? name.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : name;
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "cool" }) {
  return <span className={`rounded-full border px-2 py-0.5 ${tone === "cool" ? "border-cool/40 text-cool" : "border-line text-muted"}`}>{children}</span>;
}

function MapLegend({ mode }: { mode: MapMode }) {
  const items =
    mode === "districts"
      ? { title: "Taste districts", stops: ["#ff7a59", "#ffca58", "#48d6a6", "#56b4ff", "#b28cff"], left: "Colour: district", right: "Height: activity" }
      : mode === "fit"
        ? { title: "Where the taste lives", stops: ["#283048", "#26808c", "#4fd1c5", "#d6fff7"], left: "Weak fit", right: "Strong fit" }
        : { title: "Word of mouth spreading", stops: ["#6e3428", "#ffa040", "#ff5c8a", "#ffecf4"], left: "Not yet", right: "Most reached" };
  return (
    <div className="glass pointer-events-none absolute right-4 bottom-4 hidden rounded-xl border border-line px-3 py-2 text-[11px] text-muted lg:right-[calc(min(560px,40vw)+2rem)] lg:block">
      <div className="mb-1 font-semibold text-text">{items.title}</div>
      <div className="h-1.5 w-40 rounded-full" style={{ background: `linear-gradient(90deg, ${items.stops.join(",")})` }} />
      <div className="mt-1 flex justify-between gap-6">
        <span>{items.left}</span>
        <span>{items.right}</span>
      </div>
    </div>
  );
}
