import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import { CookieBanner } from "@/components/brand/cookie-banner";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: { default: "VistaBix — the creator partnership engine", template: "%s · VistaBix" },
  description:
    "VistaBix turns real creator demand into finished products and auditable revenue splits. Consent-first discovery, human-approved outreach, transparent scoring.",
  applicationName: "VistaBix",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  openGraph: {
    title: "VistaBix — the creator partnership engine",
    description: "Consent-first creator partnerships, built on real data and auditable splits.",
    url: baseUrl,
    siteName: "VistaBix",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "VistaBix", description: "The creator partnership engine." },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0F",
  width: "device-width",
  initialScale: 1,
};

const themeScript = `(function(){try{var t=localStorage.getItem("ibx-theme");if(t!=="light"&&t!=="dark"){t="dark"}document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${sans.variable} ${display.variable} ${mono.variable} min-h-dvh font-sans antialiased`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-lime focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-accent-fg"
        >
          Skip to content
        </a>
        <CookieBanner />
        {children}
        <Toaster
          theme="system"
          position="bottom-right"
          closeButton
          toastOptions={{
            classNames: {
              toast: "!border-line !bg-surface !text-fg !rounded-lg !shadow-lift",
              description: "!text-muted",
              actionButton: "!bg-lime !text-accent-fg",
            },
          }}
        />
      </body>
    </html>
  );
}
