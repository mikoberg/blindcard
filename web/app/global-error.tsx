"use client";

// Replaces the root layout when it fails, so it brings its own document and styles. Plain inline
// styles on purpose: nothing here may depend on the stylesheet or fonts that may be what broke.
export default function GlobalError({ retry }: { error: Error; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#e8eae3", color: "#101a2c", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "64px 16px" }}>
          <h1 style={{ fontSize: 40, lineHeight: 1.05, margin: "0 0 12px" }}>Something went wrong</h1>
          <p style={{ color: "#566073", margin: "0 0 20px" }}>
            We couldn&apos;t load Blindcard. Please try again.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              minHeight: 44,
              padding: "0 16px",
              border: 0,
              background: "#101a2c",
              color: "#e8eae3",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
