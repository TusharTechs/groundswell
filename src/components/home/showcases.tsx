// The recorded rehearsals: one featured, the rest as cards, each with its
// poster from the launch kit and its reach against the benchmark.

import Image from "next/image";
import Link from "next/link";
import { CITIES } from "@/lib/atlas/cities";
import type { ShowcaseCard } from "@/lib/home";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function ReachBars({ reach, benchmark, max }: { reach: number; benchmark: number; max: number }) {
  return (
    <div className="space-y-1.5" aria-label={`Plan reached ${pct(reach)} of the natural audience; the benchmark reached ${pct(benchmark)}`}>
      <div className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 text-[11px]">
        <span className="text-muted">The plan</span>
        <div className="h-2 rounded-full bg-panel-3">
          <div className="h-2 rounded-full bg-gradient-to-r from-glow to-hot" style={{ width: `${(reach / max) * 100}%` }} />
        </div>
        <span className="text-right font-mono text-text">{pct(reach)}</span>
      </div>
      <div className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 text-[11px]">
        <span className="text-dim">Benchmark</span>
        <div className="h-2 rounded-full bg-panel-3">
          <div className="h-2 rounded-full bg-[#5b6280]" style={{ width: `${(benchmark / max) * 100}%` }} />
        </div>
        <span className="text-right font-mono text-muted">{pct(benchmark)}</span>
      </div>
    </div>
  );
}

function Links({ s, primary }: { s: ShowcaseCard; primary?: boolean }) {
  return (
    <div className="relative z-10 flex flex-wrap gap-1.5 text-[12px]">
      <Link
        href={`/rehearse/${s.id}`}
        className={primary ? "rounded-full bg-text px-3.5 py-1.5 font-semibold text-ink hover:bg-glow" : "rounded-full border border-line px-2.5 py-0.5 text-[11.5px] text-muted hover:border-text hover:text-text"}
      >
        {primary ? "Watch the rehearsal" : "Watch"}
      </Link>
      {s.hasKit && (
        <>
          <Link href={`/l/${s.id}`} className={`rounded-full border border-line text-muted hover:border-text hover:text-text ${primary ? "px-3 py-1" : "px-2.5 py-0.5 text-[11.5px]"}`}>
            Launch page
          </Link>
          <Link href={`/campaign/${s.id}`} className={`rounded-full border border-cool/40 text-cool hover:border-cool ${primary ? "px-3 py-1" : "px-2.5 py-0.5 text-[11.5px]"}`}>
            Mission control
          </Link>
        </>
      )}
    </div>
  );
}

export function Showcases({ cards, featured }: { cards: ShowcaseCard[]; featured: string }) {
  const max = Math.max(0.05, ...cards.map((c) => c.reach ?? 0)) * 1.05;
  const top = cards.find((c) => c.id === featured);
  const rest = cards.filter((c) => c.id !== featured);
  const city = (id: string) => CITIES.find((c) => c.id === id)?.name ?? "";
  return (
    <div className="space-y-3">
      {top && (
        <article className="relative grid overflow-hidden rounded-3xl border border-line bg-panel lg:grid-cols-[1.25fr_1fr]">
          <div className="flex flex-col justify-between gap-6 p-6 lg:p-8">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">
                <span className="rounded-full bg-glow/15 px-2 py-0.5 text-glow">Featured</span>
                <span>{top.kind}</span>
                <span>·</span>
                <span>{city(top.cityId)}</span>
              </div>
              <h3 className="mt-3 font-display text-3xl leading-tight font-semibold tracking-tight">{top.title}</h3>
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">{top.brief}</p>
              {top.headline && <p className="mt-4 max-w-xl border-l-2 border-glow/60 pl-3 text-[14px] text-text/90">The plan: {top.headline}</p>}
            </div>
            <div className="space-y-4">
              {top.reach !== undefined && top.benchmark !== undefined && (
                <div className="max-w-md">
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className="font-display text-4xl font-semibold text-gradient">{(top.reach / top.benchmark).toFixed(1)}×</span>
                    <span className="text-[13px] text-muted">the reach of the same budget spent where people are</span>
                  </div>
                  <ReachBars reach={top.reach} benchmark={top.benchmark} max={max} />
                </div>
              )}
              <Links s={top} primary />
            </div>
          </div>
          {top.poster && (
            <div className="relative hidden min-h-[420px] bg-ink lg:block">
              <Image src={top.poster} alt={`The launch kit's poster for ${top.title}`} fill sizes="(min-width: 1024px) 40vw, 0px" className="object-contain p-6" />
            </div>
          )}
        </article>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((s) => (
          <li key={s.id} className="group relative flex gap-4 rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-glow/40 hover:bg-panel-2">
            {s.poster && (
              <div className="relative hidden w-24 shrink-0 self-start overflow-hidden rounded-lg border border-line sm:block" style={{ aspectRatio: "4 / 5" }}>
                <Image src={s.poster} alt="" fill sizes="96px" className="object-cover" />
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">
                  <span>{s.kind}</span>
                  <span>{city(s.cityId)}</span>
                </div>
                <h3 className="mt-1.5 font-display text-lg leading-tight font-semibold">
                  <Link href={`/rehearse/${s.id}`} className="after:absolute after:inset-0">
                    {s.title}
                  </Link>
                </h3>
                <p className="mt-1 text-[13px] leading-snug text-muted">{s.blurb}</p>
              </div>
              {s.reach !== undefined && s.benchmark !== undefined && <ReachBars reach={s.reach} benchmark={s.benchmark} max={max} />}
              <Links s={s} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
