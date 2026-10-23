"use client";

// Scrub through the campaign: day 0 to launch day, with play and pause.

export function Timeline({
  days,
  frameDays,
  frame,
  onFrame,
  playing,
  onToggle,
  label,
}: {
  days: number;
  frameDays: number[];
  frame: number;
  onFrame: (i: number) => void;
  playing: boolean;
  onToggle: () => void;
  label: string;
}) {
  const day = frameDays[frame] ?? 0;
  const left = Math.max(0, days - 1 - day);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-text text-ink hover:bg-glow"
        aria-label={playing ? "Pause" : "Play the campaign"}
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor" />
            <rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M3 1.8v8.4L10 6 3 1.8z" fill="currentColor" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2 text-[11.5px]">
          <span className="truncate text-muted">{label}</span>
          <span className="shrink-0 font-mono text-text">
            Day {day + 1} of {days} · {left === 0 ? "launch day" : `${left} day${left === 1 ? "" : "s"} to launch`}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, frameDays.length - 1)}
          value={frame}
          onChange={(e) => onFrame(Number(e.target.value))}
          className="w-full accent-[#ff5c8a]"
          aria-label="Campaign day"
        />
      </div>
    </div>
  );
}
