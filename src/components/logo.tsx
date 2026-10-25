// The Groundswell mark: a ripple rising from a point on the ground.

export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <defs>
        <linearGradient id="gs-mark" x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffb547" />
          <stop offset="0.55" stopColor="#ff5c8a" />
          <stop offset="1" stopColor="#9d8bff" />
        </linearGradient>
      </defs>
      <path d="M4 26.5h24" stroke="url(#gs-mark)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="16" cy="26.5" r="2.4" fill="url(#gs-mark)" />
      <path d="M10.5 26.5a5.5 5.5 0 0 1 11 0" stroke="url(#gs-mark)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M6 26.5a10 10 0 0 1 20 0" stroke="url(#gs-mark)" strokeWidth="2.2" strokeLinecap="round" opacity="0.7" />
      <path d="M2 26.5a14 14 0 0 1 28 0" stroke="url(#gs-mark)" strokeWidth="2.2" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark />
      {/* Compact: the wordmark appears from small-tablet width up, so the nav fits on a phone. */}
      <span className={`font-display text-[1.35rem] font-semibold tracking-tight ${compact ? "hidden min-[480px]:inline" : ""}`}>groundswell</span>
    </span>
  );
}
