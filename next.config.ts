import type { NextConfig } from "next";

import { resolveAppUrl } from "./lib/app-url";

const appHostname = new URL(resolveAppUrl()).hostname;

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  allowedDevOrigins: [appHostname],
};

export default nextConfig;
