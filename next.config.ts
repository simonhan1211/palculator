import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: `next build` emits a self-contained site in out/ that any
  // static file server can host (used by the double-click launcher package).
  output: "export",
};

export default nextConfig;
