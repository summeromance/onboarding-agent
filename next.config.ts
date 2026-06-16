import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Required for pdf-parse to work in Next.js
    config.resolve.alias = { ...config.resolve.alias, canvas: false, encoding: false };
    return config;
  },
  // Ensure rag-data PDFs are included in serverless function bundles
  outputFileTracingIncludes: {
    '/api/**': ['./rag-data/**'],
  },
};

export default nextConfig;
