import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MissionControl } from "@/components/campaign/mission-control";
import { CITIES } from "@/lib/atlas/cities";
import { isShowcaseKit, loadKit } from "@/lib/kit/load";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const kit = await loadKit(id);
  return { title: kit ? `Mission control: ${kit.input.title}` : "Mission control", robots: { index: false } };
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kit = await loadKit(id);
  if (!kit) notFound();
  const demo = await isShowcaseKit(id);
  return <MissionControl kit={kit} demo={demo} cityName={CITIES.find((c) => c.id === kit.input.cityId)?.name ?? ""} />;
}
