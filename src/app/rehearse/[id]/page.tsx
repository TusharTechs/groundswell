import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WarRoom } from "@/components/rehearsal/war-room";
import { loadShowcase, SHOWCASES } from "@/lib/showcase";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const sc = SHOWCASES.find((s) => s.id === id);
  return { title: sc ? sc.title : "Rehearsal", description: sc?.brief };
}

export default async function RecordedRehearsal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await loadShowcase(id);
  if (!run) notFound();
  return <WarRoom source={{ kind: "replay", id: run.id, cityId: run.cityId, events: run.events, recordedAt: run.recordedAt }} />;
}
