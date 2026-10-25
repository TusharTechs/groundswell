import type { Metadata } from "next";
import Link from "next/link";
import { RETENTION } from "@/lib/store";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Groundswell sends, stores and for how long.",
};

const ROWS: [string, string, string][] = [
  ["A finished live rehearsal", "Its brief and every event, so its link can be replayed and shared", `${RETENTION.days} days`],
  ["A launch kit", "The campaign's copy, partner places and tracked links, so posters and links keep working", `${RETENTION.days} days`],
  ["A tracked-link scan", "The link's code, the time, a coarse country from the hosting platform, and whether it was simulated; nothing else about the person", `${RETENTION.days} days`],
  ["A demo week on a showcase campaign", "Simulated scans and the Field Analyst's re-plan, visible only to the browser that made them", `${RETENTION.demoHours} hours`],
  ["Rate limiting", "A one-way hash of the visitor's IP address and the time of each request; never the address itself", `${RETENTION.hitsHours} hours`],
];

export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-6">
      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-cool">Privacy</p>
      <h1 className="mt-1 font-display text-4xl leading-tight font-semibold tracking-tight">What Groundswell sends, keeps, and for how long</h1>
      <p className="mt-4 text-[16px] leading-relaxed text-muted">
        Groundswell plans launches from aggregate taste data. It has no accounts, no cookies, no analytics and no ads, and it never needs to know who you are.
      </p>

      <Section title="What leaves the server">
        <li>
          <strong>To Qloo:</strong> names of artists, shows, brands and places, tags, and the locations of cities, neighbourhoods and venues. No personal data. Qloo&apos;s results describe
          aggregate taste, not individuals.
        </li>
        <li>
          <strong>To Anthropic (Claude):</strong> the brief you write and the run&apos;s own data, so the agents can work. Don&apos;t put personal information in a brief.
        </li>
        <li>
          <strong>To Google Fonts:</strong> when a poster has Japanese text, the server asks for just those characters of Noto Sans JP. Nothing about the visitor is sent.
        </li>
      </Section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold tracking-tight">What is stored, and for how long</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-panel-2 text-[11px] uppercase tracking-wider text-dim">
              <tr>
                <th className="px-4 py-2.5 font-semibold">What</th>
                <th className="px-4 py-2.5 font-semibold">Why, and what it contains</th>
                <th className="px-4 py-2.5 font-semibold">Deleted after</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ROWS.map(([what, why, how]) => (
                <tr key={what}>
                  <td className="px-4 py-3 align-top font-medium">{what}</td>
                  <td className="px-4 py-3 align-top text-muted">{why}</td>
                  <td className="px-4 py-3 align-top whitespace-nowrap text-muted">{how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[13px] text-dim">
          Stored in a Postgres database (Neon) used only by this app; deletion runs automatically as the app is used. Without a database configured, everything lives in the server&apos;s memory and
          disappears when it restarts.
        </p>
      </section>

      <Section title="In your browser">
        <li>A random id for your demo session on showcase campaigns (local storage), so your simulated weeks stay yours. It isn&apos;t linked to you.</li>
        <li>The brief you just wrote, in session storage, until the live rehearsal starts.</li>
        <li>Map tiles load from OpenFreeMap; the hosting platform (Vercel) handles requests and may keep standard logs under its own policy.</li>
      </Section>

      <Section title="What the product writes about people">
        <li>District names, launch-kit copy and simulated residents are written with rules against describing people by ethnicity, religion, health, income or politics.</li>
        <li>Simulated residents (&ldquo;street voices&rdquo;) and simulated scans are labelled as simulated wherever they appear.</li>
      </Section>

      <p className="mt-10 text-[13px] text-dim">
        Groundswell is a hackathon project. See also{" "}
        <Link href="/method#limits" className="text-cool underline underline-offset-2">
          what it does not tell you
        </Link>
        .
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-text/90 marker:text-dim">{children}</ul>
    </section>
  );
}
