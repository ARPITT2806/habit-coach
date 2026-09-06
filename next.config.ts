import { networkInterfaces } from "os";

import type { NextConfig } from "next";

const isProductionBuild = process.env.NEXT_STATIC_EXPORT === "1";

const lanIp =
  Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal)?.address ?? "localhost";

const nextConfig: NextConfig = {
  ...(isProductionBuild ? { output: "export" } : {}),
  allowedDevOrigins: isProductionBuild ? [] : [lanIp],
};

export default nextConfig;
