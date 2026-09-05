import type { NextConfig } from "next";

const isProductionBuild = process.env.NEXT_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isProductionBuild ? { output: "export" } : {}),
  allowedDevOrigins: ["192.168.29.20", "10.126.0.39"],
};

export default nextConfig;
