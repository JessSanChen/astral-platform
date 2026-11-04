import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is Next 16's opt-in static-shell caching mode. Astral is
  // almost entirely per-user dynamic data behind auth, so we keep it off and
  // use plain dynamic rendering. See docs/ARCHITECTURE.md.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
