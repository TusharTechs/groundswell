"use client";

// The living city: one glowing column per neighbourhood cell. In atlas mode,
// colour is the taste district and height is activity; in fit mode, colour and
// height are how well the launch fits; in simulation mode, columns rise and
// glow as adoption spreads, day by day. Overlays: hot zones, the venue,
// scouted partners, street voices and word-of-mouth arcs along taste ties.

import { AmbientLight, DirectionalLight, FlyToInterpolator, LightingEffect, type MapViewState, type PickingInfo } from "@deck.gl/core";
import { ArcLayer, ColumnLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import DeckGL from "@deck.gl/react";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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
  onCellClick?: (index: number) => void;
  className?: string;
  interactive?: boolean;
}

const STYLE = "https://tiles.openfreemap.org/styles/dark";
setWorkerUrl("/maplibre-gl-worker.mjs");

const lighting = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.15 }),
  key: new DirectionalLight({ color: [255, 236, 214], intensity: 1.4, direction: [-3, -6, -2] }),
  fill: new DirectionalLight({ color: [150, 170, 255], intensity: 0.6, direction: [4, 2, -1] }),
});

type RGBA = [number, number, number, number];

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
  if (ratio < 1) return mix([86, 150, 255, 235], [255, 181, 71, 240], Math.max(0, (ratio - 0.4) / 0.6));
  return mix([255, 181, 71, 240], [255, 92, 138, 255], Math.min(1, (ratio - 1) / 0.8));
}

/** Warm ramp for adoption: ember → amber → hot pink → white. */
function adoptionColor(share: number, fit: number): RGBA {
  if (share < 0.004) return fit > 0.5 ? [44, 52, 78, 150] : [30, 33, 48, 110];
  if (share < 0.05) return mix([110, 52, 40, 200], [255, 160, 64, 235], share / 0.05);
  if (share < 0.2) return mix([255, 160, 64, 235], [255, 92, 138, 250], (share - 0.05) / 0.15);
  return mix([255, 92, 138, 250], [255, 236, 244, 255], (share - 0.2) / 0.4);
}

export default function CityMap(props: CityMapProps) {
  const { atlas, mode, fit, adoption, scanShare, scanRatio, cellNote, zones, partners, venue, voices, highlightDistrict, showArcs, autoRotate, focus, shift, onCellClick, className, interactive = true } = props;
  const initial = useMemo<MapViewState>(
    () => ({ longitude: atlas.city.center[0] + (shift?.[0] ?? 0), latitude: atlas.city.center[1] + (shift?.[1] ?? 0), zoom: atlas.city.zoom - 0.15, pitch: 52, bearing: -18 }),
    // Only when the city changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atlas.city.id],
  );
  const [view, setView] = useState<MapViewState>(initial);
  const touched = useRef(false);

  useEffect(() => {
    setView({ ...initial, transitionDuration: 1600, transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }) });
    touched.current = false;
  }, [initial]);

  useEffect(() => {
    if (!focus) return;
    setView((v) => ({ ...v, longitude: focus[0], latitude: focus[1], zoom: focus[2], transitionDuration: 1400, transitionInterpolator: new FlyToInterpolator({ speed: 1.2 }) }));
  }, [focus]);

  useEffect(() => {
    if (!autoRotate) return;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!touched.current) setView((v) => (v.transitionDuration ? v : { ...v, bearing: (v.bearing ?? 0) + dt * 0.0022 }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate]);

  const cells = useMemo(() => atlas.cells.map((c, i) => ({ ...c, i })), [atlas]);
  type Cell = (typeof cells)[number];

  const columns = new ColumnLayer<Cell>({
    id: "cells",
    data: cells,
    diskResolution: 6,
    radius: 300,
    coverage: 0.92,
    extruded: true,
    pickable: interactive,
    getPosition: (c) => [c.lon, c.lat],
    getElevation: (c) => {
      if (mode === "districts") return 120 + Math.pow(c.activity, 0.8) * 1100;
      if (mode === "scans") {
        const v = scanShare?.[c.i] ?? 0;
        return v > 0 ? 80 + Math.pow(v, 0.7) * 1500 : 30;
      }
      const f = fit?.[c.i] ?? 0;
      if (mode === "fit") return f > 0 ? 80 + Math.pow(f, 2.6) * 2600 : 30;
      const a = (adoption?.[c.i] ?? 0) / 255;
      return 60 + Math.pow(f, 2.5) * 500 + Math.pow(a, 0.7) * 4200;
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
    material: { ambient: 0.55, diffuse: 0.6, shininess: 40, specularColor: [255, 230, 210] },
    updateTriggers: {
      getElevation: [mode, fit, adoption, scanShare],
      getFillColor: [mode, fit, adoption, highlightDistrict, scanRatio],
    },
    transitions: { getElevation: mode === "sim" ? 220 : 900, getFillColor: mode === "sim" ? 220 : 700 },
    onClick: (info: PickingInfo<Cell>) => {
      if (info.object && onCellClick) onCellClick(info.object.i);
    },
  });

  const arcs = useMemo(() => {
    if (!showArcs || mode !== "sim" || !adoption) return [];
    const ranked = cells.filter((c) => (adoption[c.i] ?? 0) > 18).sort((a, b) => (adoption[b.i] ?? 0) - (adoption[a.i] ?? 0)).slice(0, 36);
    const out: { from: [number, number]; to: [number, number]; w: number }[] = [];
    for (const c of ranked) {
      for (const [j, sim] of atlas.ties[c.i] ?? []) {
        if ((adoption[j] ?? 0) < 6) continue;
        out.push({ from: [c.lon, c.lat], to: [atlas.cells[j].lon, atlas.cells[j].lat], w: sim });
      }
    }
    return out.slice(0, 90);
  }, [showArcs, mode, adoption, cells, atlas]);

  const layers = [
    columns,
    new ArcLayer({
      id: "ties",
      data: arcs,
      getSourcePosition: (d) => d.from,
      getTargetPosition: (d) => d.to,
      getSourceColor: [255, 181, 71, 150],
      getTargetColor: [255, 92, 138, 60],
      getWidth: (d) => 0.6 + d.w * 1.6,
      getHeight: 0.35,
      greatCircle: false,
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
    }),
    new TextLayer<Zone>({
      id: "zone-labels",
      data: zones ?? [],
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
      data: partners ?? [],
      getPosition: (p) => [p.lon, p.lat],
      getRadius: 6,
      radiusUnits: "pixels",
      stroked: true,
      getFillColor: [255, 181, 71, 240],
      getLineColor: [7, 8, 13, 255],
      lineWidthMinPixels: 1.5,
      pickable: interactive,
    }),
    new ScatterplotLayer({
      id: "venue-glow",
      data: venue ? [venue] : [],
      getPosition: (v: { lon: number; lat: number }) => [v.lon, v.lat],
      getRadius: 22,
      radiusUnits: "pixels",
      getFillColor: [255, 255, 255, 50],
    }),
    new ScatterplotLayer({
      id: "venue",
      data: venue ? [venue] : [],
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
      data: venue ? [venue] : [],
      getPosition: (v: { lon: number; lat: number }) => [v.lon, v.lat],
      getText: (v: { name: string }) => v.name,
      getPixelOffset: [0, -22],
      getSize: 13,
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
      return { html: `<div style="font-weight:700">${p.name}</div><div style="color:#a3aac0">${p.category}${p.address ? ` · ${p.address}` : ""}</div><div>Qloo affinity <b>${p.affinity.toFixed(2)}</b></div>`, style: tooltipStyle };
    }
    if (info.layer?.id === "voices") {
      const v = o as unknown as Voice;
      return { html: `<div style="font-weight:700">${v.name}, ${v.where}</div><div style="max-width:240px">“${v.quote}”</div><div style="color:#a3aac0;margin-top:4px">Simulated resident</div>`, style: tooltipStyle };
    }
    return null;
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
        <BaseMap reuseMaps mapStyle={STYLE} attributionControl={{ compact: true }} />
      </DeckGL>
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
