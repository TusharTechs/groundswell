"use client";

// The living city: one block per neighbourhood cell, cut from the cell's real
// geohash footprint with streets between. In atlas mode, colour is the taste
// district and height is activity; in fit mode, colour and height are how well
// the launch fits; in simulation mode, blocks rise and glow as adoption
// spreads, day by day, and word of mouth flies between taste-similar
// neighbourhoods. Overlays: hot zones, the venue's beacon, scouted partners,
// street voices. Zoomed into a neighbourhood, the real buildings rise.

import { AmbientLight, DirectionalLight, FlyToInterpolator, LightingEffect, type MapViewState, type PickingInfo } from "@deck.gl/core";
import { ArcLayer, ColumnLayer, ScatterplotLayer, SolidPolygonLayer, TextLayer } from "@deck.gl/layers";
import DeckGL from "@deck.gl/react";
import { setWorkerUrl, type Map as MaplibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import ngeohash from "ngeohash";
import { useEffect, useMemo, useRef, useState } from "react";
import { Map as BaseMap } from "react-map-gl/maplibre";
import type { PartnerView, Voice } from "@/lib/agents/events";
import type { CityAtlas } from "@/lib/atlas/types";
import type { Zone } from "@/lib/launch/fit";

export type MapMode = "districts" | "fit" | "sim" | "scans";

export interface CityMapProps {
  atlas: CityAtlas;
  mode: MapMode;
  /** 0–1 per cell. */
  fit?: ArrayLike<number> | null;
  /** 0–255 per cell: adoption share of the natural audience in the current frame. */
  adoption?: ArrayLike<number> | null;
  /** Scans mode: 0–1 per cell, how many tracked-link scans the cell's neighbourhood brought (cells outside the plan's neighbourhoods are 0). */
  scanShare?: ArrayLike<number> | null;
  /** Scans mode: observed ÷ expected per cell; NaN outside the plan's neighbourhoods. */
  scanRatio?: ArrayLike<number> | null;
  /** Scans mode: extra tooltip lines for a cell. */
  cellNote?: (index: number) => string | null;
  zones?: Zone[] | null;
  partners?: PartnerView[] | null;
  venue?: { name: string; lon: number; lat: number } | null;
  voices?: Voice[] | null;
  highlightDistrict?: number | null;
  showArcs?: boolean;
  autoRotate?: boolean;
  /** Fly here when it changes: [lon, lat, zoom]. */
  focus?: [number, number, number] | null;
  /** Shift the camera centre by this many degrees [lon, lat], to frame the city beside an overlay. */
  shift?: [number, number];
  /** Where on screen the focus point should sit, in pixels from the centre [x, y] (to clear side panels). */
  focusOffsetPx?: [number, number];
  onCellClick?: (index: number) => void;
  className?: string;
  interactive?: boolean;
}

const STYLE = "https://tiles.openfreemap.org/styles/dark";
setWorkerUrl("/maplibre-gl-worker.mjs");

const lighting = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.05 }),
  key: new DirectionalLight({ color: [255, 236, 214], intensity: 1.5, direction: [-3, -6, -2] }),
  fill: new DirectionalLight({ color: [150, 170, 255], intensity: 0.65, direction: [4, 2, -1] }),
});

type RGBA = [number, number, number, number];

/** Labels and markers draw over the 3D blocks instead of being cut by them. */
const ON_TOP = { depthCompare: "always", depthWriteEnabled: false } as const;

/** Above this zoom the real buildings rise and the taste blocks fade back. */
const STREET_ZOOM = 13.3;

/** How much of each cell's footprint its block covers; the rest reads as streets. */
const BLOCK = 0.74;

function mix(a: number[], b: number[], t: number): RGBA {
  const u = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, (a[3] ?? 255) + ((b[3] ?? 255) - (a[3] ?? 255)) * u] as RGBA;
}

/** Cool ramp for taste fit: slate → teal → mint white. */
function fitColor(f: number): RGBA {
  if (f <= 0) return [34, 38, 54, 120];
  if (f < 0.6) return mix([40, 48, 72, 150], [38, 128, 140, 210], f / 0.6);
  if (f < 0.85) return mix([38, 128, 140, 210], [79, 209, 197, 240], (f - 0.6) / 0.25);
  return mix([79, 209, 197, 245], [214, 255, 247, 255], (f - 0.85) / 0.15);
}

/** Diverging ramp for scans against expectation: behind (blue) → on track (amber) → ahead (pink). */
function scanColor(ratio: number): RGBA {
  if (!Number.isFinite(ratio)) return [30, 33, 48, 110];
  if (ratio < 1) return mix([86, 150, 255, 235], [255, 181, 71, 240], Math.max(0, (ratio - 0.6) / 0.4));
  return mix([255, 181, 71, 240], [255, 92, 138, 255], Math.min(1, (ratio - 1) / 0.5));
}

/** Warm ramp for adoption: ember → amber → hot pink → white; cells with little natural audience stay dim. */
function adoptionColor(share: number, fit: number): RGBA {
  const presence = 0.22 + 0.78 * fit * fit;
  if (share < 0.004) return fit > 0.5 ? [44, 52, 78, 150] : [30, 33, 48, 110];
  const c = share < 0.05 ? mix([110, 52, 40, 200], [255, 160, 64, 235], share / 0.05) : share < 0.2 ? mix([255, 160, 64, 235], [255, 92, 138, 250], (share - 0.05) / 0.15) : mix([255, 92, 138, 250], [255, 236, 244, 255], (share - 0.2) / 0.4);
  return [c[0], c[1], c[2], Math.round(c[3] * presence)];
}

const km = (a: [number, number], b: [number, number]) => {
  const dx = (a[0] - b[0]) * 111.32 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  const dy = (a[1] - b[1]) * 110.57;
  return Math.hypot(dx, dy);
};

export default function CityMap(props: CityMapProps) {
  const { atlas, mode, fit, adoption, scanShare, scanRatio, cellNote, zones, partners, venue, voices, highlightDistrict, showArcs, autoRotate, focus, shift, focusOffsetPx, onCellClick, className, interactive = true } =
    props;
  const initial = useMemo<MapViewState>(
    () => ({ longitude: atlas.city.center[0] + (shift?.[0] ?? 0), latitude: atlas.city.center[1] + (shift?.[1] ?? 0), zoom: atlas.city.zoom - 0.15, pitch: 52, bearing: -18 }),
    // Only when the city changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atlas.city.id],
  );
  const [view, setView] = useState<MapViewState>(initial);
  const touched = useRef(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setView({ ...initial, transitionDuration: 1600, transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }) });
    touched.current = false;
  }, [initial]);

  useEffect(() => {
    if (!focus) return;
    // Put the focus point where the panels leave room, not under them: move the camera the other way.
    const [ox, oy] = focusOffsetPx ?? [0, 0];
    const metresPerPx = (156543.03 * Math.cos((focus[1] * Math.PI) / 180)) / 2 ** focus[2];
    const lon = focus[0] - (ox * metresPerPx) / (111320 * Math.cos((focus[1] * Math.PI) / 180));
    const lat = focus[1] + (oy * metresPerPx) / 110570;
    setView((v) => ({ ...v, longitude: lon, latitude: lat, zoom: focus[2], transitionDuration: 1400, transitionInterpolator: new FlyToInterpolator({ speed: 1.2 }) }));
    // A new focus point, not a new offset, moves the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!autoRotate || reduceMotion) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      if (!touched.current) setView((v) => (v.transitionDuration ? v : { ...v, bearing: (v.bearing ?? 0) + dt * 0.0022 }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate, reduceMotion]);

  const cells = useMemo(
    () =>
      atlas.cells.map((c, i) => {
        // The cell's footprint, shrunk around its centre so streets show between blocks.
        const [s, w, n, e] = ngeohash.decode_bbox(c.gh);
        const cy = (s + n) / 2;
        const cx = (w + e) / 2;
        const hy = ((n - s) / 2) * BLOCK;
        const hx = ((e - w) / 2) * BLOCK;
        return { ...c, i, polygon: [[cx - hx, cy - hy], [cx + hx, cy - hy], [cx + hx, cy + hy], [cx - hx, cy + hy]] as [number, number][] };
      }),
    [atlas],
  );
  type Cell = (typeof cells)[number];

  /** Relative population per cell, as the simulator weighs it. */
  const mass = useMemo(() => atlas.cells.map((c) => 0.4 + 0.6 * Math.sqrt(c.activity)), [atlas]);

  const street = (view.zoom ?? 0) > STREET_ZOOM;
  const blocks = new SolidPolygonLayer<Cell>({
    id: "cells",
    data: cells,
    getPolygon: (c) => c.polygon,
    // At street level the blocks lie flat, as a tint on the ground, and the real buildings rise.
    extruded: !street,
    pickable: interactive,
    opacity: street ? 0.16 : 1,
    getElevation: (c) => {
      if (mode === "districts") return 120 + Math.pow(c.activity, 0.8) * 1100;
      if (mode === "scans") {
        const v = scanShare?.[c.i] ?? 0;
        return v > 0 ? 80 + Math.pow(v, 0.7) * 1500 : 30;
      }
      const f = fit?.[c.i] ?? 0;
      if (mode === "fit") return f > 0 ? 80 + Math.pow(f, 2.6) * 2600 : 30;
      // Height is people reached: the share reached times the cell's natural audience (population × fit³).
      const a = (adoption?.[c.i] ?? 0) / 255;
      return 40 + Math.min(4400, 9000 * a * Math.pow(f, 3) * mass[c.i]);
    },
    getFillColor: (c) => {
      if (mode === "districts") {
        const d = atlas.districts[c.district];
        const dim = highlightDistrict !== null && highlightDistrict !== undefined && highlightDistrict !== c.district;
        const base = d?.color ?? [120, 120, 140];
        return [base[0], base[1], base[2], dim ? 40 : Math.round(110 + c.activity * 140)] as RGBA;
      }
      if (mode === "fit") return fitColor(fit?.[c.i] ?? 0);
      if (mode === "scans") return scanColor(scanRatio?.[c.i] ?? NaN);
      return adoptionColor((adoption?.[c.i] ?? 0) / 255, fit?.[c.i] ?? 0);
    },
    material: { ambient: 0.5, diffuse: 0.65, shininess: 36, specularColor: [255, 230, 210] },
    updateTriggers: {
      getElevation: [mode, fit, adoption, scanShare],
      getFillColor: [mode, fit, adoption, highlightDistrict, scanRatio],
    },
    transitions: { getElevation: mode === "sim" ? 220 : 900, getFillColor: mode === "sim" ? 220 : 700 },
    onClick: (info: PickingInfo<Cell>) => {
      if (info.object && onCellClick) onCellClick(info.object.i);
    },
  });

  // Word of mouth: the most-reached cells and the taste-similar cells their buzz travels to.
  const arcs = useMemo(() => {
    if (!showArcs || mode !== "sim" || !adoption) return [];
    const ranked = cells.filter((c) => (adoption[c.i] ?? 0) > 18).sort((a, b) => (adoption[b.i] ?? 0) - (adoption[a.i] ?? 0)).slice(0, 36);
    const out: { from: [number, number]; to: [number, number]; w: number; seed: number }[] = [];
    for (const c of ranked) {
      for (const [j, sim] of atlas.ties[c.i] ?? []) {
        if ((adoption[j] ?? 0) < 6) continue;
        out.push({ from: [c.lon, c.lat], to: [atlas.cells[j].lon, atlas.cells[j].lat], w: sim, seed: (c.i * 7919 + j * 104729) % 1000 });
      }
    }
    return out.slice(0, 60);
  }, [showArcs, mode, adoption, cells, atlas]);

  // A clock for the moving parts (comets along the ties, the venue's pulse), at most ~40 fps.
  const animate = !reduceMotion && (arcs.length > 0 || Boolean(venue));
  useEffect(() => {
    if (!animate) return;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 24) {
        last = t;
        setNow(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate]);

  // Each tie carries a comet: a bright head and a fading tail, arcing over the city.
  const comets = useMemo(() => {
    if (!arcs.length) return [];
    const out: { p: [number, number, number]; r: number; a: number }[] = [];
    for (const arc of arcs) {
      const period = 2600 + (arc.seed % 7) * 260;
      const u0 = ((now + arc.seed * 37) % period) / period;
      const peak = km(arc.from, arc.to) * 1000 * 0.22;
      for (let k = 0; k < 9; k++) {
        const u = u0 - k * 0.018;
        if (u <= 0 || u >= 1) continue;
        const p: [number, number, number] = [arc.from[0] + (arc.to[0] - arc.from[0]) * u, arc.from[1] + (arc.to[1] - arc.from[1]) * u, 4 * peak * u * (1 - u) + 150];
        out.push({ p, r: (k === 0 ? 3 : 2.4 - k * 0.2) * (0.8 + arc.w * 0.5), a: k === 0 ? 255 : 210 - k * 22 });
      }
    }
    return out;
  }, [arcs, now]);

  // Labels: at most three neighbourhoods, the biggest first, each name once, never on top of each other or the venue.
  const labelZones = useMemo(() => {
    const placed: Zone[] = [];
    for (const z of [...(zones ?? [])].sort((a, b) => b.audienceShare - a.audienceShare)) {
      if (placed.length >= 3) break;
      if (venue && km([z.center[0], z.center[1] + 0.0165], [venue.lon, venue.lat]) < 2.6) continue;
      if (placed.some((p) => p.locality === z.locality || km(p.center, z.center) < 3)) continue;
      placed.push(z);
    }
    return placed;
  }, [zones, venue]);

  const pulse = ((now % 2200) / 2200) * (reduceMotion ? 0 : 1);
  const venueData = venue ? [venue] : [];

  const layers = [
    blocks,
    new ArcLayer({
      id: "ties",
      // Word of mouth crosses town; at street level it would only clutter the view.
      data: street ? [] : arcs,
      getSourcePosition: (d) => d.from,
      getTargetPosition: (d) => d.to,
      getSourceColor: [255, 181, 71, 70],
      getTargetColor: [255, 92, 138, 26],
      getWidth: (d) => 0.5 + d.w * 1.2,
      getHeight: 0.44,
      greatCircle: false,
    }),
    new ScatterplotLayer<{ p: [number, number, number]; r: number; a: number }>({
      id: "comets",
      data: street ? [] : comets,
      getPosition: (d) => d.p,
      getRadius: (d) => d.r,
      radiusUnits: "pixels",
      getFillColor: (d) => [255, 214, 150, d.a],
      parameters: ON_TOP,
    }),
    new ScatterplotLayer<Zone>({
      id: "zones",
      data: zones ?? [],
      getPosition: (z) => z.center,
      getRadius: 1600,
      stroked: true,
      filled: true,
      getFillColor: [79, 209, 197, 14],
      getLineColor: [79, 209, 197, 200],
      lineWidthMinPixels: 1.5,
      radiusUnits: "meters",
      pickable: interactive,
      onClick: (info: PickingInfo<Zone>) => {
        const z = info.object;
        if (!z) return;
        touched.current = true;
        setView((v) => ({ ...v, longitude: z.center[0], latitude: z.center[1], zoom: 13.9, pitch: 58, transitionDuration: 1600, transitionInterpolator: new FlyToInterpolator({ speed: 1.3 }) }));
      },
    }),
    new TextLayer<Zone>({
      id: "zone-labels",
      parameters: ON_TOP,
      data: labelZones,
      getPosition: (z) => [z.center[0], z.center[1] + 0.0165],
      getText: (z) => (z.locality ?? `Zone ${z.id + 1}`).toUpperCase(),
      getSize: 11,
      getColor: [180, 245, 238, 230],
      fontFamily: "Inter, sans-serif",
      fontWeight: 700,
      characterSet: "auto",
      outlineWidth: 3,
      outlineColor: [7, 8, 13, 220],
      fontSettings: { sdf: true },
      billboard: true,
    }),
    new ScatterplotLayer<PartnerView>({
      id: "partners",
      parameters: ON_TOP,
      data: partners ?? [],
      getPosition: (p) => [p.lon, p.lat],
      getRadius: street ? 9 : 6,
      radiusUnits: "pixels",
      stroked: true,
      getFillColor: [255, 181, 71, 240],
      getLineColor: [7, 8, 13, 255],
      lineWidthMinPixels: 1.5,
      pickable: interactive,
      updateTriggers: { getRadius: street },
      onClick: (info: PickingInfo<PartnerView>) => {
        const p = info.object;
        if (!p) return;
        touched.current = true;
        setView((v) => ({ ...v, longitude: p.lon, latitude: p.lat, zoom: 15.4, pitch: 60, transitionDuration: 1800, transitionInterpolator: new FlyToInterpolator({ speed: 1.3 }) }));
      },
    }),
    new TextLayer<PartnerView>({
      id: "partner-labels",
      parameters: ON_TOP,
      data: street ? (partners ?? []) : [],
      getPosition: (p) => [p.lon, p.lat],
      getText: (p) => p.name,
      getPixelOffset: [0, -18],
      getSize: 12,
      getColor: [255, 214, 150, 255],
      fontFamily: "Inter, sans-serif",
      fontWeight: 600,
      characterSet: "auto",
      outlineWidth: 3,
      outlineColor: [7, 8, 13, 230],
      fontSettings: { sdf: true },
    }),
    // The venue: a beam of light with a ring pulsing out from its foot.
    new ColumnLayer({
      id: "venue-beacon",
      data: venueData,
      getPosition: (v: { lon: number; lat: number }) => [v.lon, v.lat],
      diskResolution: 16,
      radius: street ? 7 : 55,
      getElevation: street ? 160 : 3600,
      extruded: true,
      getFillColor: [255, 255, 255, 120],
      material: false,
      updateTriggers: { getElevation: street },
    }),
    new ScatterplotLayer({
      id: "venue-pulse",
      data: venueData,
      getPosition: (v: { lon: number; lat: number }) => [v.lon, v.lat],
      getRadius: (street ? 60 : 250) + pulse * (street ? 240 : 1100),
      radiusUnits: "meters",
      stroked: true,
      filled: false,
      getLineColor: [255, 92, 138, Math.round(220 * (1 - pulse))],
      lineWidthMinPixels: 2,
      parameters: ON_TOP,
      updateTriggers: { getRadius: [pulse, street], getLineColor: pulse },
    }),
    new ScatterplotLayer({
      id: "venue",
      parameters: ON_TOP,
      data: venueData,
      getPosition: (v: { lon: number; lat: number }) => [v.lon, v.lat],
      getRadius: 8,
      radiusUnits: "pixels",
      stroked: true,
      getFillColor: [255, 255, 255, 255],
      getLineColor: [255, 92, 138, 255],
      lineWidthMinPixels: 3,
    }),
    new TextLayer({
      id: "venue-label",
      parameters: ON_TOP,
      data: venueData,
      getPosition: (v: { lon: number; lat: number }) => [v.lon, v.lat],
      getText: (v: { name: string }) => v.name,
      getPixelOffset: [0, -24],
      getSize: 14,
      getColor: [255, 255, 255, 255],
      fontFamily: "Inter, sans-serif",
      fontWeight: 700,
      characterSet: "auto",
      outlineWidth: 3,
      outlineColor: [7, 8, 13, 230],
      fontSettings: { sdf: true },
    }),
    new ScatterplotLayer<Voice>({
      id: "voices",
      parameters: ON_TOP,
      data: voices ?? [],
      getPosition: (v) => [v.lon, v.lat],
      getRadius: 9,
      radiusUnits: "pixels",
      stroked: true,
      getFillColor: (v) => (v.stance === "in" ? [61, 220, 151, 255] : v.stance === "maybe" ? [255, 204, 102, 255] : [160, 166, 190, 255]),
      getLineColor: [7, 8, 13, 255],
      lineWidthMinPixels: 2,
      pickable: interactive,
    }),
  ];

  const tooltip = (info: PickingInfo) => {
    const o = info.object as Record<string, unknown> | undefined;
    if (!o) return null;
    if (info.layer?.id === "cells") {
      const c = o as unknown as Cell;
      const d = atlas.districts[c.district];
      const f = fit?.[c.i];
      const a = adoption?.[c.i];
      const lines = [
        `<div style="font-weight:700">${c.locality ?? "Unnamed area"}</div>`,
        `<div style="color:#a3aac0">${d?.name ?? ""}</div>`,
        mode !== "districts" && mode !== "scans" && f !== undefined ? `<div>Taste fit <b>${Math.round(f * 100)}</b>/100</div>` : "",
        mode === "scans" ? (cellNote?.(c.i) ?? "") : "",
        mode === "sim" && a !== undefined ? `<div>Reached <b>${((a / 255) * 100).toFixed(0)}%</b> of the natural audience</div>` : "",
      ];
      return { html: lines.join(""), style: tooltipStyle };
    }
    if (info.layer?.id === "partners") {
      const p = o as unknown as PartnerView;
      return {
        html: `<div style="font-weight:700">${p.name}</div><div style="color:#a3aac0">${p.category}${p.address ? ` · ${p.address}` : ""}</div><div>Qloo affinity <b>${p.affinity.toFixed(2)}</b></div><div style="color:#a3aac0;margin-top:4px">Click to fly in</div>`,
        style: tooltipStyle,
      };
    }
    if (info.layer?.id === "zones") {
      const z = o as unknown as Zone;
      return { html: `<div style="font-weight:700">${z.locality ?? "Hot zone"}</div><div>${(z.audienceShare * 100).toFixed(1)}% of the natural audience</div><div style="color:#a3aac0;margin-top:4px">Click to fly in</div>`, style: tooltipStyle };
    }
    if (info.layer?.id === "voices") {
      const v = o as unknown as Voice;
      return { html: `<div style="font-weight:700">${v.name}, ${v.where}</div><div style="max-width:240px">“${v.quote}”</div><div style="color:#a3aac0;margin-top:4px">Simulated resident</div>`, style: tooltipStyle };
    }
    return null;
  };

  // Real buildings from the base map's own tiles, rising once the camera is at street level.
  const addBuildings = (map: MaplibreMap) => {
    if (map.getLayer("gs-buildings-3d") || !map.getSource("openmaptiles")) return;
    const firstLabel = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
    map.addLayer(
      {
        id: "gs-buildings-3d",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 12.5,
        paint: {
          "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 8], 0, "#2c3349", 40, "#3c4563", 150, "#566185"],
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 12.5, 0, 13.6, 0.95],
        },
      },
      firstLabel,
    );
  };

  return (
    <div className={className} onPointerDown={() => (touched.current = true)} onWheel={() => (touched.current = true)}>
      <DeckGL
        viewState={view}
        onViewStateChange={({ viewState }) => setView(viewState as MapViewState)}
        controller={interactive ? { dragRotate: true, touchRotate: true } : false}
        layers={layers}
        effects={[lighting]}
        getTooltip={tooltip}
        style={{ position: "absolute", inset: "0" }}
      >
        <BaseMap reuseMaps mapStyle={STYLE} attributionControl={{ compact: true }} onLoad={(e) => addBuildings(e.target)} />
      </DeckGL>
      {/* A soft vignette pulls the eye to the middle of the city. */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 55%, rgba(7,8,13,0) 55%, rgba(7,8,13,0.55) 100%)" }} />
      {street && interactive && (
        <button
          type="button"
          onClick={() => setView({ ...initial, bearing: view.bearing, transitionDuration: 1600, transitionInterpolator: new FlyToInterpolator({ speed: 1.3 }) })}
          className="glass absolute top-20 left-1/2 z-10 -translate-x-1/2 rounded-full border border-line px-3.5 py-1.5 text-[12.5px] text-text hover:border-text"
        >
          ← Back to the whole city
        </button>
      )}
    </div>
  );
}

const tooltipStyle = {
  background: "rgba(14,16,23,0.95)",
  color: "#eef0f6",
  border: "1px solid #333a51",
  borderRadius: "10px",
  padding: "8px 10px",
  fontSize: "12px",
  lineHeight: "1.45",
  fontFamily: "Inter, sans-serif",
};
