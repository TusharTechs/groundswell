import type { Metadata } from "next";
import { AtlasExplorer } from "@/components/atlas/atlas-explorer";

export const metadata: Metadata = {
  title: "Taste Atlas",
  description: "Seven cities mapped by what their neighbourhoods love, from Qloo's taste graph, with taste twins across cities.",
};

export default function AtlasPage() {
  return <AtlasExplorer />;
}
