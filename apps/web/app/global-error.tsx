'use client';

// Last-resort boundary for errors thrown in the root layout itself. Must render its own
// <html>/<body> because the normal layout has crashed.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>Something went wrong</h2>
          <p style={{ color: '#6b7280', marginTop: 8 }}>The application hit an unexpected error.</p>
          <button
            onClick={() => reset()}
            style={{ marginTop: 16, padding: '8px 16px', background: '#3d8de2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
