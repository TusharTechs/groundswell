import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mark } from "@/components/logo";
import { CITIES } from "@/lib/atlas/cities";
import { LABELS, langOf, localDate } from "@/lib/kit/i18n";
import { isShowcaseKit, loadKit } from "@/lib/kit/load";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const kit = await loadKit(id);
  return kit ? { title: kit.input.title, description: kit.input.pitch } : { title: "Launch" };
}

export default async function LaunchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const { from } = await searchParams;
  const kit = await loadKit(id);
  if (!kit) notFound();
  const demo = await isShowcaseKit(id);
  const input = kit.input;
  const city = CITIES.find((c) => c.id === input.cityId);
  const source = from ? kit.links.find((l) => l.code === from) : undefined;
  const lang = langOf(input.language);
  const L = LABELS[lang];
  return (
    <main className="mx-auto max-w-2xl px-5 pt-10 pb-20" lang={lang}>
      {demo && (
        <div className="mb-6 rounded-xl border border-warn/40 bg-warn/10 p-3 text-[13px] text-warn">
          A demo launch page from a recorded Groundswell rehearsal. The launch is fictional; this page shows what a campaign&apos;s QR codes and links open.
        </div>
      )}
      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-glow">
        {city?.name}
        {input.venue ? ` · ${input.venue}` : ""}
      </p>
      <h1 className="mt-2 font-display text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">{input.title}</h1>
      <p className="mt-3 text-[18px] text-text/90">{kit.tagline}</p>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">{kit.blurb ?? input.pitch}</p>
      {kit.english && (
        <details className="mt-2 text-[13px] text-dim" lang="en">
          <summary className="cursor-pointer">In English</summary>
          <p className="mt-1 text-text/90">{kit.english.tagline}</p>
          <p className="mt-1">{kit.english.blurb}</p>
        </details>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-panel p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">{L.when}</div>
          <div className="mt-1 font-display text-xl font-semibold">{localDate(input.launchDate, lang)}</div>
          <div className="text-[13px] text-muted">{input.allAges ? L.allAges : (input.ageLimit ?? "")}</div>
        </div>
        <div className="rounded-2xl border border-line bg-panel p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">{L.where}</div>
          <div className="mt-1 font-display text-xl font-semibold">{input.venue ?? city?.name}</div>
          {input.venue && (
            <a
              className="text-[13px] text-cool underline-offset-2 hover:underline"
              href={`https://www.google.com/maps/search/${encodeURIComponent(`${input.venue} ${city?.name ?? ""}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              {L.maps}
            </a>
          )}
        </div>
      </div>

      {input.comps.length > 0 && <p className="mt-5 text-[15px] text-text/90">{L.fans(input.comps.join(", "))}</p>}

      <div className="mt-6">
        {input.launchUrl ? (
          <a href={input.launchUrl} className="inline-block rounded-full bg-gradient-to-r from-glow to-hot px-6 py-3 font-semibold text-ink">
            {L.tickets}
          </a>
        ) : (
          <p className="rounded-xl border border-line bg-panel-2 p-3 text-[13px] text-muted">{demo ? "Tickets aren't on sale: this is a demo launch." : L.noTickets}</p>
        )}
      </div>

      {input.partners.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">{L.findAt}</h2>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
            {input.partners.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3 text-[14px]">
                <span className="font-medium">{p.name}</span>
                <span className="text-[12px] text-dim">{p.address ?? p.category}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {source && (
        <p className="mt-8 text-[12px] text-dim">You arrived from: {source.label}. Groundswell counted the visit for the organiser: the link, the time and a coarse country, nothing else about you.</p>
      )}

      <footer className="mt-12 flex items-center gap-2 border-t border-line pt-5 text-[12px] text-dim">
        <Mark size={18} />
        <span>
          Planned with{" "}
          <Link href="/" className="text-muted underline-offset-2 hover:underline">
            Groundswell
          </Link>
          {demo && (
            <>
              {" · "}
              <Link href={`/rehearse/${id}`} className="text-muted underline-offset-2 hover:underline">
                Watch the rehearsal behind it
              </Link>
            </>
          )}
          {" · "}
          <Link href="/privacy" className="text-muted underline-offset-2 hover:underline">
            Privacy
          </Link>
        </span>
      </footer>
    </main>
  );
}
