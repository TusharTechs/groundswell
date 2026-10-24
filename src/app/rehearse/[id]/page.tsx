import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WarRoom } from "@/components/rehearsal/war-room";
import { loadShowcase, SHOWCASES, type RecordedRun } from "@/lib/showcase";
import { loadRun } from "@/lib/store";

// A recorded showcase from data/runs, or a saved live run from the store.
async function load(id: string): Promise<{ run: RecordedRun; showcase: boolean } | null> {
  const showcase = await loadShowcase(id);
  if (showcase) return { run: showcase, showcase: true };
  if (!/^run-[a-f0-9]{8}$/.test(id)) return null;
  const run = await loadRun(id).catch(() => null);
  return run ? { run, showcase: false } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const sc = SHOWCASES.find((s) => s.id === id);
  if (sc) return { title: sc.title, description: sc.brief };
  const found = await load(id);
  const spec = found?.run.events.find((x) => x.e.type === "spec")?.e;
  return { title: spec?.type === "spec" ? spec.spec.title : "Rehearsal", description: found?.run.brief, robots: { index: false } };
}

export default async function Rehearsal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await load(id);
  if (!found) notFound();
  const { run, showcase } = found;
  return <WarRoom source={{ kind: "replay", id: run.id, cityId: run.cityId, events: run.events, recordedAt: run.recordedAt, showcase, launchUrl: run.launchUrl ?? null }} />;
}
