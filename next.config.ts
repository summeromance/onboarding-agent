import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  outputFileTracingIncludes: {
    '/api/**': ['./rag-data/**'],
  },
};

export default nextConfig;
