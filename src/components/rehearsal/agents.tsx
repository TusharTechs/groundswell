// The team: each agent's colour, glyph and live status.

import { AGENTS, type AgentName } from "@/lib/agents/events";
import type { AgentState } from "./use-run";

export const AGENT_COLOR: Record<AgentName, string> = {
  director: "#9d8bff",
  analyst: "#4fd1c5",
  cartographer: "#56b4ff",
  scout: "#ffb547",
  strategist: "#ff5c8a",
  simulator: "#ff9a3c",
  critic: "#ff7a7a",
  voices: "#3ddc97",
  producer: "#ffe08a",
};

const PATHS: Record<AgentName, string> = {
  director: "M12 3l2.4 5.6L20 9.3l-4.3 3.9 1.2 5.8L12 16.2 7.1 19l1.2-5.8L4 9.3l5.6-.7L12 3z",
  analyst: "M11 4a7 7 0 1 0 4.2 12.6L20 21M11 8v6M8 11h6",
  cartographer: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6zM9 4v14M15 6v14",
  scout: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z",
  strategist: "M5 19V9m0 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 0c0 6 14 3 14 10M19 19a2 2 0 1 0 0 .01M12 12h4",
  simulator: "M4 18c3-9 5-12 8-6s5 3 8-6M4 21h16",
  critic: "M9 11l2 2 4-4M5 4h14v12l-4 4H5V4z",
  voices: "M4 5h16v10H9l-5 4V5zM8 9h8M8 12h5",
  producer: "M7 3h7l5 5v13H7V3zM14 3v5h5M10 13h6M10 17h6",
};

export function AgentIcon({ agent, size = 16 }: { agent: AgentName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={AGENT_COLOR[agent]} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[agent]} />
    </svg>
  );
}

export function AgentChip({ agent, state }: { agent: AgentName; state?: AgentState["state"] }) {
  const working = state === "working";
  return (
    <span
      className={`relative inline-flex size-7 shrink-0 items-center justify-center rounded-full border ${working ? "pulse-ring" : ""}`}
      style={{ borderColor: `${AGENT_COLOR[agent]}${state === "idle" ? "40" : "aa"}`, color: AGENT_COLOR[agent], background: `${AGENT_COLOR[agent]}${working ? "26" : "12"}` }}
    >
      <AgentIcon agent={agent} size={15} />
    </span>
  );
}

export function TeamRoster({ agents, active }: { agents: Record<AgentName, AgentState>; active?: AgentName }) {
  const order: AgentName[] = ["director", "analyst", "cartographer", "scout", "strategist", "simulator", "critic", "voices", "producer"];
  return (
    <ul className="grid grid-cols-1 gap-1.5">
      {order.map((a) => {
        const st = agents[a];
        return (
          <li key={a} className={`flex items-start gap-2.5 rounded-xl px-2 py-1.5 transition-colors ${active === a ? "bg-panel-3" : ""}`}>
            <AgentChip agent={a} state={st.state} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                {AGENTS[a].title}
                {st.state === "done" && <span className="text-[10px] font-medium uppercase tracking-wider text-good">done</span>}
                {st.state === "working" && <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: AGENT_COLOR[a] }}>working</span>}
              </div>
              <div className="truncate text-[12px] text-muted" title={st.note || AGENTS[a].role}>
                {st.note || AGENTS[a].role}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** One row of agent chips with the active agent's current task: used once results take the space. */
export function TeamStrip({ agents, active }: { agents: Record<AgentName, AgentState>; active?: AgentName }) {
  const order: AgentName[] = ["director", "analyst", "cartographer", "scout", "strategist", "simulator", "critic", "voices", "producer"];
  const current = active ?? order.find((a) => agents[a].state === "working");
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {order.map((a) => (
          <span key={a} title={`${AGENTS[a].title}: ${agents[a].note || AGENTS[a].role}`}>
            <AgentChip agent={a} state={agents[a].state} />
          </span>
        ))}
      </div>
      <p className="mt-2 truncate text-[12px] text-muted">
        {current ? (
          <>
            <span className="font-semibold" style={{ color: AGENT_COLOR[current] }}>
              {AGENTS[current].title}:
            </span>{" "}
            {agents[current].note}
          </>
        ) : (
          "The team is done."
        )}
      </p>
    </div>
  );
}
