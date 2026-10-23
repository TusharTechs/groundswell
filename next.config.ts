import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root: a stray lockfile higher up the tree otherwise makes
  // Next.js guess the wrong workspace root.
  outputFileTracingRoot: __dirname,
  // Routes read the city atlases, recorded rehearsals and benchmark results from
  // data/ by computed paths, which file tracing can't see on its own.
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/**/*"],
    "/rehearse/**/*": ["./data/**/*"],
  },
  // The simulation engine ships as TypeScript source from the workspace.
  transpilePackages: ["@groundswell/sim"],
  // No floating dev-tools badge (it shows up in screenshots and demos).
  devIndicators: false,
};

export default nextConfig;
