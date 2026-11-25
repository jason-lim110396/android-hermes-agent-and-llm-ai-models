'use client';

/**
 * Root error boundary. The tab-level ErrorBoundary cannot catch a failure in
 * the root layout or in hydration, which used to leave the Android WebView
 * blank. This renders a visible recovery screen instead, with both a React
 * retry and a full reload.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          alignItems: 'center',
          background: '#09090b',
          color: '#fafafa',
          display: 'flex',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          justifyContent: 'center',
          margin: 0,
          minHeight: '100vh',
        }}
      >
        <main style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>
            Hermes could not start
          </h1>
          <p style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 1.5, margin: '0 0 12px' }}>
            An unexpected error interrupted the app. Your chats and models stay on this device.
          </p>
          <pre
            style={{
              background: '#18181b',
              border: '1px solid #3f3f46',
              borderRadius: 10,
              color: '#fda4af',
              fontSize: 11,
              margin: '0 0 18px',
              maxHeight: 140,
              overflow: 'auto',
              padding: 10,
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
            }}
          >
            {error?.message || 'Unknown error'}
          </pre>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              onClick={reset}
              style={{
                background: '#0891b2',
                border: 0,
                borderRadius: 10,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 700,
                padding: '10px 18px',
              }}
            >
              Retry
            </button>
            {/* Raw anchor on purpose: reset may not recover a failed
                hydration, and this must work without the React runtime. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                background: '#27272a',
                border: '1px solid #3f3f46',
                borderRadius: 10,
                color: '#e4e4e7',
                fontSize: 13,
                fontWeight: 700,
                padding: '10px 18px',
                textDecoration: 'none',
              }}
            >
              Reload app
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
