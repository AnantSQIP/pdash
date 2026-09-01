'use client';

/**
 * Last-resort boundary for errors thrown in the root layout itself.
 *
 * It must render its own <html>/<body>, and it cannot rely on the stylesheet, the fonts or any
 * component — by definition the thing that loads those has just crashed. So everything here is
 * inline and self-contained, and it is written to look deliberate rather than like a browser
 * default, because this is the screen that decides whether a person thinks the product is
 * broken or merely having a moment.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F4F6F9',
          color: '#16202E',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <div style={{ maxWidth: 420, padding: 32, textAlign: 'center' }}>
          <div
            style={{
              width: 48, height: 48, margin: '0 auto 24px', borderRadius: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: '#FEF2F2', boxShadow: '0 0 0 1px rgba(220,38,38,0.10)',
            }}
            aria-hidden
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: '-0.015em' }}>
            Squark Dashboard stopped responding
          </h1>
          <p style={{ margin: '8px auto 0', maxWidth: 360, fontSize: 13.5, lineHeight: 1.6, color: '#6B7280' }}>
            The application hit an error it could not recover from on its own. Reloading will start
            it cleanly. Your work is saved on the server, not in this page.
          </p>

          <button
            onClick={() => reset()}
            style={{
              marginTop: 28, padding: '9px 18px', fontSize: 13, fontWeight: 500,
              color: '#fff', backgroundColor: '#111827', border: 'none',
              borderRadius: 8, cursor: 'pointer',
            }}
          >
            Reload the application
          </button>

          {error.digest && (
            <p style={{ marginTop: 32, fontSize: 11, color: '#D1D5DB', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              Reference {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
