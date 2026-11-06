import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; keep it out of the bundler.
  serverExternalPackages: ["better-sqlite3"],
  // Do not expose any server env to the client. Only NEXT_PUBLIC_* is readable in the browser.
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
