"use client";

import { useEffect } from "react";

/**
 * Last-resort App Router error boundary. Only used when the ROOT layout itself
 * throws, so it must render its own <html>/<body>. Purely additive — the
 * successful render path never mounts this component.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            textAlign: "center",
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          }}
        >
          <div style={{ maxWidth: "28rem" }}>
            <div aria-hidden style={{ fontSize: "2.25rem", marginBottom: "1rem" }}>
              ⚠️
            </div>
            <h1 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
              Something went wrong
            </h1>
            <p style={{ marginTop: "0.5rem", color: "#6B7280", fontSize: "0.875rem" }}>
              The application hit an unexpected error. Please reload the page.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: "1.5rem",
                padding: "0.5rem 1rem",
                borderRadius: "0.625rem",
                background: "#222831",
                color: "#fff",
                fontSize: "0.875rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
