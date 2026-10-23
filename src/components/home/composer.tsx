"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CITIES } from "@/lib/atlas/cities";
import { BRIEF_KEY } from "../rehearsal/live-key";

const EXAMPLES: Record<string, string> = {
  chicago: "A queer dance night in the spirit of Charli XCX and Chappell Roan, every other Saturday at Smartbar, starting in five weeks. 21+. $6,000 to promote.",
  "new-york": "A jazz-meets-hip-hop brunch series inspired by Robert Glasper and Erykah Badu opening in Harlem in six weeks. $9,000 budget.",
  "los-angeles": "A Korean-Mexican street food pop-up from a chef who cooks like Roy Choi, weekends at Smorgasburg LA, starting in a month. $7,500.",
  atlanta: "A sneaker and vinyl swap meet for fans of Outkast and Travis Scott at Ponce City Market in six weeks. All ages. $5,000.",
  london: "A K-pop dance workshop tour for fans of NewJeans and Stray Kids, three Saturdays at venues across London, eight weeks out. All ages. $10,000.",
  "mexico-city": "A natural wine and vinyl bar opening in Juárez for people who love Rosalía and Arca, in seven weeks. $12,000.",
  tokyo: "A Studio Ghibli-inspired café and art exhibition opening in Shimokitazawa in six weeks, for fans of Spirited Away and Hayao Miyazaki. All ages. $20,000.",
};

export function Composer({ cityId, onCity }: { cityId: string; onCity: (id: string) => void }) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [budget, setBudget] = useState("");
  const [weeks, setWeeks] = useState("6");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (brief.trim().length < 20) return setError("Describe the launch in a sentence or two: what it is, who it's for, where and when.");
    const b = budget ? Number(budget.replace(/[^0-9.]/g, "")) : undefined;
    if (b !== undefined && (!Number.isFinite(b) || b < 1000 || b > 250000)) return setError("Budget must be between $1,000 and $250,000.");
    sessionStorage.setItem(BRIEF_KEY, JSON.stringify({ brief: brief.trim(), cityId, budget: b, days: Number(weeks) * 7 }));
    router.push("/rehearse/live");
  };

  return (
    <form onSubmit={submit} className="glass space-y-3 rounded-2xl border border-line p-4 shadow-2xl shadow-black/40">
      <label htmlFor="brief" className="block text-[12px] font-semibold uppercase tracking-[0.14em] text-dim">
        What are you launching?
      </label>
      <textarea
        id="brief"
        value={brief}
        onChange={(e) => {
          setBrief(e.target.value);
          setError(null);
        }}
        rows={3}
        maxLength={1500}
        placeholder={EXAMPLES[cityId]}
        className="w-full resize-none rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-[15px] leading-snug placeholder:text-dim focus:border-glow/60 focus:outline-none"
      />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-dim">
          City
          <select value={cityId} onChange={(e) => onCity(e.target.value)} className="rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-[13px] text-text">
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-dim">
          Budget
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="numeric"
            placeholder="$12,000"
            className="w-28 rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-[13px] text-text placeholder:text-dim"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-dim">
          Launch in
          <select value={weeks} onChange={(e) => setWeeks(e.target.value)} className="rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-[13px] text-text">
            {[3, 4, 5, 6, 8, 10, 12].map((w) => (
              <option key={w} value={w}>
                {w} weeks
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setBrief(EXAMPLES[cityId])} className="rounded-full border border-line px-3 py-2 text-[13px] text-muted hover:text-text">
            Example
          </button>
          <button type="submit" className="rounded-full bg-gradient-to-r from-glow to-hot px-4 py-2 text-[14px] font-semibold text-ink shadow-lg shadow-hot/20 hover:brightness-110">
            Rehearse it
          </button>
        </div>
      </div>
      {error && <p className="text-[13px] text-bad">{error}</p>}
      <p className="text-[11.5px] leading-snug text-dim">A live rehearsal takes about three minutes: nine agents, around 20 Qloo requests, hundreds of simulated runs.</p>
    </form>
  );
}
