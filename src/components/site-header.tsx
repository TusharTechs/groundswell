"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";

const NAV = [
  { href: "/", label: "Rehearse", short: "Rehearse" },
  { href: "/atlas", label: "Taste Atlas", short: "Atlas" },
  { href: "/method", label: "How it works", short: "How" },
];

export function SiteHeader() {
  const path = usePathname();
  // Launch pages belong to the launch, not to Groundswell.
  if (path.startsWith("/l/")) return null;
  const onMap = path === "/" || path.startsWith("/rehearse") || path.startsWith("/atlas");
  return (
    <header className={`${onMap ? "absolute inset-x-0 top-0 z-30" : "sticky top-0 z-30 border-b border-line glass"}`}>
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="rounded-md focus-visible:outline-2 focus-visible:outline-glow" aria-label="Groundswell home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm" aria-label="Main">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" || path.startsWith("/rehearse") : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-full px-2.5 py-1.5 whitespace-nowrap transition-colors sm:px-3 ${active ? "bg-text text-ink" : "text-muted hover:bg-panel-3 hover:text-text"}`}
              >
                <span className="sm:hidden">{n.short}</span>
                <span className="hidden sm:inline">{n.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
