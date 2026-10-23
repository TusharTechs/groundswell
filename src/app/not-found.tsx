import Link from "next/link";
import { Mark } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <Mark size={56} />
      <h1 className="font-display text-3xl font-semibold">Nothing spreads from here</h1>
      <p className="text-muted">This page doesn&apos;t exist. The city does.</p>
      <div className="flex gap-2">
        <Link href="/" className="rounded-full bg-text px-4 py-2 font-semibold text-ink hover:bg-glow">
          Rehearse a launch
        </Link>
        <Link href="/atlas" className="rounded-full border border-line px-4 py-2 hover:border-text">
          Taste Atlas
        </Link>
      </div>
    </main>
  );
}
