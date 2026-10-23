// Server-sent events for the live rehearsal stream.

import Anthropic from "@anthropic-ai/sdk";
import { QlooError } from "./qloo/client";
import { RefusalError } from "./llm";

export function publicMessage(err: unknown): string {
  if (err instanceof QlooError) {
    if (err.code === "rate_limited") return "Qloo's rate limit was reached. Wait a minute and try again.";
    if (err.code === "timeout" || err.code === "network" || err.code === "server") return "Qloo didn't respond in time. Try again in a moment.";
    if (err.code === "missing_key" || err.code === "auth") return "The server's Qloo connection isn't configured.";
    return "Qloo rejected one of the requests. Try naming different comparables.";
  }
  if (err instanceof RefusalError) return "The model declined to work on this brief.";
  if (err instanceof Anthropic.RateLimitError) return "The model is rate-limited right now. Try again in a minute.";
  if (err instanceof Anthropic.AuthenticationError) return "The server's model connection isn't configured.";
  if (err instanceof Anthropic.APIError) return "A model request failed. Try again in a moment.";
  if (err instanceof Error && /Unknown city|could not produce a plan|Describe|comparables/.test(err.message)) return err.message;
  return "Something went wrong during the rehearsal.";
}

export function eventStream<E>(work: (send: (e: E) => void) => Promise<unknown>, onClose?: () => void): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const write = (s: string) => {
        if (!closed) controller.enqueue(encoder.encode(s));
      };
      const keepAlive = setInterval(() => write(": ping\n\n"), 15_000);
      try {
        await work((e) => write(`data: ${JSON.stringify(e)}\n\n`));
      } catch (err) {
        console.error("rehearsal failed:", err instanceof Error ? `${err.name}: ${err.message}` : err);
        write(`data: ${JSON.stringify({ type: "error", message: publicMessage(err) })}\n\n`);
      } finally {
        clearInterval(keepAlive);
        onClose?.();
        closed = true;
        controller.close();
      }
    },
    cancel() {
      onClose?.();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
