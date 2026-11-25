import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hermes AI Agent",
  description: "On-Device Sovereign Local LLM & Autonomous Hermes Agent Studio",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} w-full h-full antialiased`}
    >
      <body className="w-full h-full m-0 p-0 overflow-hidden bg-zinc-950 text-white font-sans">
        {children}

        {/* Server-rendered watchdog. It stays invisible and is hidden by the
            app's mount effect; if hydration never completes it becomes visible
            after 7s, so a dead first paint can never look like an empty app.
            Plain HTML and inline styles so it survives a failed JS/CSS load. */}
        <div
          id="hermes-boot-fallback"
          role="alert"
          style={{
            alignItems: 'center',
            background: '#09090b',
            color: '#fafafa',
            display: 'flex',
            fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
            inset: 0,
            justifyContent: 'center',
            position: 'fixed',
            zIndex: 2147483647,
          }}
        >
          <div style={{ maxWidth: 360, padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
              Hermes did not finish starting
            </p>
            <p style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 1.5, margin: '0 0 18px' }}>
              The interface failed to load. Your chats and models stay on this device.
            </p>
            {/* A raw anchor, not next/link: this panel must work even when the
                client bundle or hydration never ran. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                background: '#0891b2',
                borderRadius: 10,
                color: '#fff',
                display: 'inline-block',
                fontSize: 13,
                fontWeight: 700,
                padding: '10px 18px',
                textDecoration: 'none',
              }}
            >
              Retry
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
