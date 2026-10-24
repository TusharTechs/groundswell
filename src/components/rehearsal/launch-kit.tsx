"use client";

// The Launch Kit tab: the Creative Director's copy for each neighbourhood,
// posters with tracked QR codes, partner outreach, podcast scripts, the
// ad-targeting sheet and calendar, and one download with everything.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CityAtlas } from "@/lib/atlas/types";
import { calendar, linkUrl, targetingSheet, toCsv, withLink } from "@/lib/kit/build";
import { langOf, localDate } from "@/lib/kit/i18n";
import type { Kit, KitInput } from "@/lib/kit/types";
import { AgentIcon } from "./agents";

type Progress = { kind: "step" | "check"; text: string; verdict?: string };

const enc = (o: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      className="rounded-full border border-line px-2.5 py-0.5 text-[11.5px] text-muted hover:border-text hover:text-text"
    >
      {done ? "Copied" : label}
    </button>
  );
}

const share = {
  x: (t: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}`,
  threads: (t: string) => `https://www.threads.net/intent/post?text=${encodeURIComponent(t)}`,
  whatsapp: (t: string) => `https://wa.me/?text=${encodeURIComponent(t)}`,
  linkedin: (u: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`,
};

export function LaunchKit({
  input: draft,
  atlas,
  demo,
  canProduce,
}: {
  /** The kit input built from this rehearsal; a saved kit's own input wins. */
  input: KitInput;
  atlas: CityAtlas;
  /** A recorded showcase: posters and pages say the launch is fictional. */
  demo: boolean;
  /** Live runs can produce a kit; recordings only show theirs. */
  canProduce: boolean;
}) {
  const [kit, setKit] = useState<Kit | null>(null);
  const [state, setState] = useState<"loading" | "missing" | "making" | "ready" | "error">("loading");
  const [progress, setProgress] = useState<Progress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zone, setZone] = useState<number | null>(null);
  const [zipping, setZipping] = useState(false);
  const [english, setEnglish] = useState(false);

  const input = kit?.input ?? draft;
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  useEffect(() => {
    let alive = true;
    fetch(`/api/kit/${draft.campaignId}`)
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((k: Kit | null) => {
        if (!alive) return;
        if (k) {
          setKit(k);
          setState("ready");
        } else setState("missing");
      })
      .catch(() => alive && setState("missing"));
    return () => {
      alive = false;
    };
  }, [draft.campaignId]);

  const make = async () => {
    setState("making");
    setError(null);
    setProgress([]);
    try {
      const res = await fetch("/api/kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({})))?.error ?? "The kit couldn't be produced.");
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
          const e = JSON.parse(line.slice(6));
          if (e.type === "kit-step") setProgress((p) => [...p, { kind: "step", text: e.text }]);
          else if (e.type === "kit-check")
            setProgress((p) => [
              ...p,
              {
                kind: "check",
                text: `${e.name} in ${e.zone}`,
                verdict: e.verdict,
              },
            ]);
          else if (e.type === "kit") {
            setKit(e.kit);
            setState("ready");
          } else if (e.type === "error") throw new Error(e.message);
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  };

  const zones = kit?.zones ?? [];
  const activeZone = zones.find((z) => z.zoneId === zone) ?? zones[0];
  const zoneMeta = (id: number) => input.zones.find((z) => z.id === id);
  const color = (id: number) => {
    const z = input.zones.find((x) => x.id === id);
    const d = atlas.districts.find((x) => x.name === z?.district);
    return d?.color;
  };
  const url = (code: string) => linkUrl(origin, input.campaignId, code);
  const lang = langOf(input.language);
  // Two hot zones can share a neighbourhood name; tell them apart by their taste district.
  const zoneLabel = (id: number) => {
    const z = zoneMeta(id);
    if (!z) return "";
    return input.zones.filter((x) => x.locality === z.locality).length > 1 ? `${z.locality} · ${z.district}` : z.locality;
  };
  const posterSrc = (k: Kit, zoneId: number, partner?: KitInput["partners"][number], code?: string) => {
    const copy = k.zones.find((z) => z.zoneId === zoneId);
    if (!copy) return "";
    return `/api/poster?d=${enc({
      t: input.title,
      h: copy.posterHeadline,
      s: copy.posterSubline,
      v: input.venue ?? undefined,
      dt: localDate(input.launchDate, lang),
      f: input.comps.length ? input.comps.slice(0, 3).join(", ") : undefined,
      l: lang,
      p: partner?.name,
      q: url(code ?? `z${zoneId}ig`),
      c: color(zoneId),
      demo,
    })}`;
  };

  const downloadAll = async () => {
    if (!kit) return;
    setZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const md: string[] = [`# ${input.title}`, "", kit.tagline, "", kit.hashtags.join(" "), ""];
      for (const z of kit.zones) {
        const m = zoneMeta(z.zoneId);
        md.push(
          `## ${zoneLabel(z.zoneId)} (${m?.district})`,
          "",
          `Poster: ${z.posterHeadline} / ${z.posterSubline}`,
          "",
          `Instagram:\n${withLink(z.instagram, url(`z${z.zoneId}ig`))}`,
          "",
          `TikTok or Reels hook: ${z.tiktokHook}\n${z.tiktokBeats.map((b, i) => `${i + 1}. ${b}`).join("\n")}\nLink: ${url(`z${z.zoneId}tt`)}`,
          "",
          `X or Threads:\n${withLink(z.xPost, url(`z${z.zoneId}x`))}`,
          "",
          `References checked on Qloo for this neighbourhood: ${z.references.map((r) => `${r.name} (${r.verdict})`).join(", ") || "none beyond the comparables"}`,
          "",
          ...(z.english
            ? [
                `English translation:\nPoster: ${z.english.posterHeadline} / ${z.english.posterSubline}\nInstagram: ${withLink(z.english.instagram, url(`z${z.zoneId}ig`))}\nX or Threads: ${withLink(z.english.xPost, url(`z${z.zoneId}x`))}`,
                "",
              ]
            : []),
        );
      }
      zip.file("copy.md", md.join("\n"));
      kit.partners.forEach((p) => {
        const partner = input.partners.find((x) => x.id === p.id);
        if (!partner) return;
        zip.file(
          `emails/${partner.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`,
          `Subject: ${p.subject}\n\n${withLink(p.body, url(p.code))}\n\n${[partner.address, partner.phone, partner.website].filter(Boolean).join("\n")}${
            p.english ? `\n\n---\nEnglish translation\nSubject: ${p.english.subject}\n\n${withLink(p.english.body, url(p.code))}` : ""
          }`,
        );
      });
      if (kit.podcasts.length) zip.file("podcast-scripts.md", kit.podcasts.map((p) => `## ${p.name}\n\n${withLink(p.script, url(p.code))}`).join("\n\n"));
      zip.file("ad-targeting.csv", targetingSheet(input));
      zip.file("calendar.ics", calendar(input, kit));
      zip.file("tracked-links.csv", toCsv([["code", "what", "link"], ...kit.links.map((l) => [l.code, l.label, url(l.code)])]));
      const posters = await Promise.all(
        input.partners.map(async (p, i) => {
          const res = await fetch(posterSrc(kit, p.zone, p, `p${i + 1}`));
          return {
            name: `posters/${String(i + 1).padStart(2, "0")}-${p.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`,
            blob: res.ok ? await res.blob() : null,
          };
        }),
      );
      for (const p of posters) if (p.blob) zip.file(p.name, p.blob);
      zip.file(
        "README.txt",
        `Launch kit for ${input.title}, produced by Groundswell.\n\ncopy.md: copy for each neighbourhood\nemails/: outreach drafts for each partner (replace the bracketed offer)\nposters/: one per partner, each with its own tracked QR code\nad-targeting.csv: a targeting brief per neighbourhood to set up by hand in an ads manager\ncalendar.ics: every dated action in the plan\ntracked-links.csv: the link behind each poster, post and email\n${demo ? "\nThis kit comes from a recorded rehearsal; the launch is fictional.\n" : ""}`,
      );
      download(`${input.campaignId}-launch-kit.zip`, await zip.generateAsync({ type: "blob" }), "application/zip");
    } finally {
      setZipping(false);
    }
  };

  if (state === "loading") return <p className="py-8 text-center text-[13px] text-dim">Loading the launch kit…</p>;

  if (state === "missing" || state === "making" || state === "error")
    return (
      <section className="space-y-4">
        <div className="rounded-2xl border border-line bg-panel-2 p-4">
          <div className="flex items-center gap-2">
            <AgentIcon agent="creative" />
            <h3 className="font-semibold">Produce the launch kit</h3>
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            The Creative Director (an agent) writes copy for each neighbourhood in the plan, checking every cultural reference it wants to use against that neighbourhood on Qloo. Code then builds
            posters with a tracked QR code for each partner, the outreach emails, podcast scripts, an ad-targeting sheet and a calendar.
          </p>
          {!canProduce && <p className="mt-2 text-[13px] text-dim">This recording has no launch kit yet.</p>}
          {canProduce && state !== "making" && (
            <button type="button" onClick={make} className="mt-3 rounded-full bg-gradient-to-r from-glow to-hot px-4 py-2 text-[13px] font-semibold text-ink">
              Produce the launch kit
            </button>
          )}
          {error && <p className="mt-2 text-[13px] text-bad">{error}</p>}
        </div>
        {progress.length > 0 && (
          <ul className="space-y-1.5 text-[12.5px]">
            {progress.map((p, i) => (
              <li key={i} className="rise-in flex items-center gap-2">
                {p.kind === "check" ? (
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[10.5px] ${p.verdict === "strong here" ? "bg-good/15 text-good" : p.verdict === "mixed" ? "bg-warn/15 text-warn" : "bg-panel-3 text-dim"}`}
                  >
                    {p.verdict}
                  </span>
                ) : (
                  <AgentIcon agent="creative" size={13} />
                )}
                <span className="text-muted">{p.kind === "check" ? `Checked on Qloo: ${p.text}` : p.text}</span>
              </li>
            ))}
            {state === "making" && <li className="h-1.5 w-24 rounded-full shimmer" />}
          </ul>
        )}
      </section>
    );

  if (!kit || !activeZone) return null;
  const m = zoneMeta(activeZone.zoneId);
  const translated = english && activeZone.english;
  const ig = withLink(translated ? activeZone.english!.instagram : activeZone.instagram, url(`z${activeZone.zoneId}ig`));
  const xp = withLink(translated ? activeZone.english!.xPost : activeZone.xPost, url(`z${activeZone.zoneId}x`));
  const hasEnglish = kit.zones.some((z) => z.english);
  const firstPartner = input.partners.findIndex((p) => p.zone === activeZone.zoneId);

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <p className="font-display text-2xl font-semibold leading-tight">{kit.tagline}</p>
        <p className="font-mono text-[12px] text-cool">{kit.hashtags.join(" ")}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={downloadAll} disabled={zipping} className="rounded-full bg-text px-3.5 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-glow disabled:opacity-60">
            {zipping ? "Packing…" : "Download everything (.zip)"}
          </button>
          <a href={`/l/${input.campaignId}`} target="_blank" rel="noreferrer" className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] hover:border-text">
            Launch page ↗
          </a>
          <a href={share.linkedin(`${origin}/l/${input.campaignId}`)} target="_blank" rel="noreferrer" className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] hover:border-text">
            Share on LinkedIn
          </a>
          <Link href={`/campaign/${input.campaignId}`} className="rounded-full border border-cool/50 px-3.5 py-1.5 text-[12.5px] text-cool hover:border-cool">
            Mission control →
          </Link>
        </div>
      </header>

      <div role="tablist" aria-label="Neighbourhoods" className="flex flex-wrap gap-1.5">
        {kit.zones.map((z) => (
          <button
            key={z.zoneId}
            role="tab"
            type="button"
            aria-selected={z.zoneId === activeZone.zoneId}
            onClick={() => setZone(z.zoneId)}
            className={`rounded-full px-3 py-1 text-[12px] ${z.zoneId === activeZone.zoneId ? "bg-text text-ink" : "border border-line text-muted hover:text-text"}`}
          >
            {zoneLabel(z.zoneId)}
          </button>
        ))}
        {hasEnglish && (
          <button
            type="button"
            aria-pressed={english}
            onClick={() => setEnglish((e) => !e)}
            className={`ml-auto rounded-full px-3 py-1 text-[12px] ${english ? "bg-cool text-ink" : "border border-cool/50 text-cool"}`}
          >
            {english ? `Show in ${input.language}` : "Show the English translation"}
          </button>
        )}
      </div>
      {translated && (
        <p className="-mt-2 text-[12px] text-dim">
          The poster, in English: {activeZone.english!.posterHeadline} / {activeZone.english!.posterSubline}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-[minmax(0,13rem)_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={posterSrc(kit, activeZone.zoneId, firstPartner >= 0 ? input.partners[firstPartner] : undefined, firstPartner >= 0 ? `p${firstPartner + 1}` : undefined)}
          alt={`Poster for ${m?.locality}: ${activeZone.posterHeadline}`}
          className="w-full rounded-xl border border-line"
        />
        <div className="space-y-3 text-[13px]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">{m?.district}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {activeZone.references.length ? (
                activeZone.references.map((r) => (
                  <span
                    key={r.name}
                    className={`rounded-full px-2 py-0.5 text-[11px] ${r.verdict === "strong here" ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}
                    title="Checked on Qloo for this neighbourhood"
                  >
                    {r.name} · {r.verdict}
                  </span>
                ))
              ) : (
                <span className="text-[11.5px] text-dim">No references beyond the comparables.</span>
              )}
            </div>
          </div>
          <Block title="Instagram" text={ig} actions={<Copy text={ig} />} />
          <Block
            title="TikTok or Reels"
            text={`${activeZone.tiktokHook}\n${activeZone.tiktokBeats.map((b, i) => `${i + 1}. ${b}`).join("\n")}`}
            actions={<Copy text={`${activeZone.tiktokHook}\n${activeZone.tiktokBeats.join("\n")}\n${url(`z${activeZone.zoneId}tt`)}`} />}
          />
          <Block
            title="X or Threads"
            text={xp}
            actions={
              <>
                <Copy text={xp} />
                <a className="rounded-full border border-line px-2.5 py-0.5 text-[11.5px] text-muted hover:text-text" href={share.x(xp)} target="_blank" rel="noreferrer">
                  Post on X
                </a>
                <a className="rounded-full border border-line px-2.5 py-0.5 text-[11.5px] text-muted hover:text-text" href={share.threads(xp)} target="_blank" rel="noreferrer">
                  Threads
                </a>
                <a className="rounded-full border border-line px-2.5 py-0.5 text-[11.5px] text-muted hover:text-text" href={share.whatsapp(xp)} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              </>
            }
          />
        </div>
      </div>

      {kit.partners.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">Partner outreach ({kit.partners.length})</h3>
          <ul className="space-y-2">
            {kit.partners.map((p) => {
              const partner = input.partners.find((x) => x.id === p.id);
              if (!partner) return null;
              const i = input.partners.indexOf(partner);
              const body = withLink(english && p.english ? p.english.body : p.body, url(p.code));
              const subject = english && p.english ? p.english.subject : p.subject;
              return (
                <li key={p.id} className="rounded-xl border border-line bg-panel-2 p-3 text-[12.5px]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{partner.name}</span>
                    <span className="text-[11px] text-dim">
                      {partner.role?.replaceAll("_", " ")} · {zoneLabel(partner.zone)}
                    </span>
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-muted">{subject}</summary>
                    <p className="mt-2 whitespace-pre-line text-text/90">{body}</p>
                  </details>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <a
                      className="rounded-full border border-line px-2.5 py-0.5 text-[11.5px] text-muted hover:text-text"
                      href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
                    >
                      Open in email app
                    </a>
                    <Copy text={`${subject}\n\n${body}`} label="Copy email" />
                    <a
                      className="rounded-full border border-line px-2.5 py-0.5 text-[11.5px] text-muted hover:text-text"
                      href={posterSrc(kit, partner.zone, partner, `p${i + 1}`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Poster with its QR
                    </a>
                    {partner.website && (
                      <a className="rounded-full border border-line px-2.5 py-0.5 text-[11.5px] text-muted hover:text-text" href={partner.website} target="_blank" rel="noreferrer">
                        Website
                      </a>
                    )}
                    {partner.phone && <span className="px-1 py-0.5 text-[11.5px] text-dim">{partner.phone}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {kit.podcasts.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">Podcast host-reads</h3>
          {kit.podcasts.map((p) => (
            <Block key={p.name} title={p.name} text={withLink(p.script, url(p.code))} actions={<Copy text={withLink(p.script, url(p.code))} />} />
          ))}
        </section>
      )}

      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => download(`${input.campaignId}-ad-targeting.csv`, targetingSheet(input), "text/csv")}
          className="rounded-full border border-line px-3 py-1.5 text-[12px] hover:border-text"
        >
          Ad-targeting sheet (.csv)
        </button>
        <button
          type="button"
          onClick={() => download(`${input.campaignId}-calendar.ics`, calendar(input, kit), "text/calendar")}
          className="rounded-full border border-line px-3 py-1.5 text-[12px] hover:border-text"
        >
          Calendar (.ics)
        </button>
        <button
          type="button"
          onClick={() => download(`${input.campaignId}-tracked-links.csv`, toCsv([["code", "what", "link"], ...kit.links.map((l) => [l.code, l.label, url(l.code)])]), "text/csv")}
          className="rounded-full border border-line px-3 py-1.5 text-[12px] hover:border-text"
        >
          Tracked links (.csv)
        </button>
      </section>

      <p className="text-[11.5px] text-dim">
        Copy written by Claude. {kit.checks.length} references checked on Qloo for their neighbourhoods; only those that came back strong or mixed there are used. The ad sheet is a brief to set up by
        hand in an ads manager, not an upload file.
      </p>
    </section>
  );
}

function Block({ title, text, actions }: { title: string; text: string; actions?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel-2 p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">{title}</span>
        <span className="flex flex-wrap gap-1.5">{actions}</span>
      </div>
      <p className="whitespace-pre-line text-[13px] text-text/90">{text}</p>
    </div>
  );
}
