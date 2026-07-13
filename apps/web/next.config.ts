import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // @shmoves/core is raw TS (main → src/index.ts); Next must transpile it.
  transpilePackages: ["@shmoves/core"],
  // Monorepo root, so file tracing doesn't warn about the root lockfile.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
