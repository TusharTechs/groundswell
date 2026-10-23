// Shared Claude settings. Server-only: reads ANTHROPIC_API_KEY from the environment.

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

/**
 * Server-side fallback: if a safety classifier declines a request, the API
 * re-runs it on Anthropic's recommended fallback model for that category.
 */
export const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

let client: Anthropic | null = null;
export function claude(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 2, timeout: 180_000 });
  return client;
}

export class RefusalError extends Error {
  constructor(public category: string | null | undefined) {
    super(`Claude declined this request${category ? ` (${category})` : ""}.`);
    this.name = "RefusalError";
  }
}
