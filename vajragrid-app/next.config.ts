import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['onnxruntime-node', 'aedes', 'mqtt'],
};

export default nextConfig;
