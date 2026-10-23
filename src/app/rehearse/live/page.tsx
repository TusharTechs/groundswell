"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BRIEF_KEY } from "@/components/rehearsal/live-key";
import { WarRoom } from "@/components/rehearsal/war-room";

type Input = { brief: string; cityId: string; budget?: number; days?: number };

export default function LiveRehearsal() {
  const [input, setInput] = useState<Input | null | undefined>(undefined);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(BRIEF_KEY);
      // A live run starts once; reloading shouldn't spend the quota again.
      sessionStorage.removeItem(BRIEF_KEY);
      setInput(raw ? (JSON.parse(raw) as Input) : null);
    } catch {
      setInput(null);
    }
  }, []);
  if (input === undefined) return <div className="min-h-dvh" />;
  if (input === null)
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-display text-2xl font-semibold">No brief to rehearse</h1>
        <p className="text-muted">Live rehearsals start from the home page, so a reload doesn&apos;t run the team twice.</p>
        <Link href="/" className="rounded-full bg-text px-4 py-2 font-semibold text-ink">
          Write a brief
        </Link>
      </main>
    );
  return <WarRoom source={{ kind: "live", input }} />;
}
