import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
