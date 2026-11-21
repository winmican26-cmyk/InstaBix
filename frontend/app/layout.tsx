import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "VistaBix · Operator Dashboard",
  description: "VistaBix operator dashboard, read live from the VistaBix API.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to dashboard
        </a>
        {children}
      </body>
    </html>
  );
}
