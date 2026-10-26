/* ============================================================
   AFTER-RESPONSE EXECUTION (serverless-safe background work)
   ------------------------------------------------------------
   Runs a task AFTER the HTTP response has been sent without the
   classic serverless "fire-and-forget gets killed" problem:

   - On Vercel (production): waitUntil() from @vercel/functions
     extends the function instance's lifetime until the promise
     settles (bounded by the function's maxDuration configured in
     vercel.json), so the task reliably completes after the
     response flushes to the client.
   - Locally / non-Vercel servers: waitUntil() has no backing
     request context, so the task is scheduled with setImmediate —
     the long-running Node process keeps the pending I/O alive
     (SMTP sockets, etc.) until the task finishes.

   Errors are always caught + logged here — never leaked to the
   client, never allowed to crash the request handler.

   NOTE: this is ONLY for work that is genuinely optional to the
   user-facing response (invoices, confirmation emails, OTP
   emails). The required database/authentication state must
   ALWAYS be committed before the task is scheduled.
   ============================================================ */

import { waitUntil } from "@vercel/functions";

/**
 * Run `task` after the response is sent.
 *
 * On Vercel (process.env.VERCEL === "1") the platform keeps the
 * serverless instance alive until the promise settles — never the
 * unsafe detached-promise pattern. Locally we fall back to
 * setImmediate, where the long-running Node process keeps the
 * pending I/O (SMTP sockets) alive.
 *
 * @param {() => Promise<any>} task  The async work to complete post-response.
 * @param {string} label Short name used in logs.
 */
export function runAfterResponse(task, label = "afterResponse") {
  if (typeof task !== "function") {
    console.error(`[AfterResponse:${label}] task is not a function — skipped`);
    return;
  }

  const wrapped = () =>
    Promise.resolve()
      .then(task)
      .catch((err) =>
        console.error(`[AfterResponse:${label}] failed:`, err?.message || err)
      );

  if (process.env.VERCEL === "1") {
    // Vercel: waitUntil keeps the function instance alive until the task
    // settles. @vercel/functions resolves the request context itself and is
    // a no-op outside a request context — so this is safe to call directly.
    try {
      waitUntil(wrapped());
      return;
    } catch {
      // fall through to the local path below
    }
  }

  // Local / non-Vercel: run in the background of the long-running process.
  setImmediate(wrapped);
}
