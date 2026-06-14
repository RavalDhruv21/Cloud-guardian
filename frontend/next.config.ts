import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'export',
  trailingSlash: false,
  images: { unoptimized: true },
};

export default nextConfig;
  