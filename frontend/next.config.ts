import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

// Next.js 16: Turbopack is the default for dev and build; no deprecated
// flags (next lint, middleware, serverRuntimeConfig) are used here.
// Pin the app root so a parent package-lock/Tailwind config cannot affect this
// standalone starter when both apps live in the same folder tree.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
