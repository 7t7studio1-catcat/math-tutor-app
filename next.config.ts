import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@google/genai", "@resvg/resvg-js", "archiver", "mathjax-full"],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  httpAgentOptions: {
    keepAlive: true,
  },
};

export default nextConfig;
