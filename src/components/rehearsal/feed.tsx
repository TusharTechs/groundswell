"use client";

// The live log of what the team is doing: the Director's reasoning, each
// agent's work, and every Qloo request behind it.

import { useEffect, useRef, useState } from "react";
import { AGENTS } from "@/lib/agents/events";
import type { Evidence } from "@/lib/qloo/entities";
import { AGENT_COLOR, AgentIcon } from "./agents";
import type { FeedItem } from "./use-run";

function Receipt({ calls }: { calls: Evidence[] }) {
  return (
    <ul className="mt-1.5 space-y-1 font-mono text-[10.5px] leading-snug text-dim">
      {calls.map((c) => {
        const keys = Object.entries(c.params)
          .filter(([k]) => !k.startsWith("feature.") && k !== "take")
          .map(([k, v]) => `${k}=${v.length > 48 ? `${v.slice(0, 45)}…` : v}`)
          .join(" ");
        return (
          <li key={c.callId} className="break-all">
            <span className="text-muted">GET {c.path}</span> {keys}
            <span className="text-dim/70"> · {c.cached ? "cached" : `${c.ms} ms`}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Item({ item }: { item: FeedItem }) {
  const [open, setOpen] = useState(false);
  const color = AGENT_COLOR[item.agent];
  if (item.kind === "thought" && item.agent === "director") {
    return (
      <li className="rise-in flex gap-2.5">
        <span className="mt-0.5 shrink-0">
          <AgentIcon agent="director" size={15} />
        </span>
        <p className="text-[13.5px] leading-snug text-text">{item.text}</p>
      </li>
    );
  }
  if (item.kind === "qloo") {
    return (
      <li className="rise-in pl-6">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 font-mono text-[10.5px] text-cool hover:border-cool/60"
          aria-expanded={open}
        >
          QLOO · {item.text}
          <span aria-hidden>{open ? "▾" : "▸"}</span>
        </button>
        {open && item.calls && <Receipt calls={item.calls} />}
      </li>
    );
  }
  const label = AGENTS[item.agent].title;
  const tone = item.kind === "error" ? "text-bad" : item.kind === "status" ? "text-muted" : "text-text";
  return (
    <li className="rise-in flex gap-2.5">
      <span className="mt-0.5 shrink-0">
        <AgentIcon agent={item.agent} size={15} />
      </span>
      <div className="min-w-0">
        <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
          {label}
          {item.round ? ` · round ${item.round}` : ""}
        </span>
        <span className={`text-[13px] leading-snug ${tone}`}>{item.text}</span>
      </div>
    </li>
  );
}

export function Feed({ items, live }: { items: FeedItem[]; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items.length]);
  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }}
      className="scroll-thin min-h-0 flex-1 overflow-y-auto pr-1"
      aria-live="polite"
    >
      <ul className="space-y-2.5">
        {items.map((it) => (
          <Item key={it.id} item={it} />
        ))}
        {live && (
          <li className="flex items-center gap-2 pl-6 text-[12px] text-dim">
            <span className="inline-block h-1.5 w-12 rounded-full shimmer" /> working
          </li>
        )}
      </ul>
    </div>
  );
}
