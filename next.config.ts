import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // API-only app: no pages, no images.
  poweredByHeader: false,
  // Fonts are read from disk at runtime by the scores image renderer.
  outputFileTracingIncludes: {
    "/api/**": ["./assets/fonts/**"],
  },
};

export default nextConfig;
