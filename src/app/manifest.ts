import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Habit Coach – Adaptive Habit Coach",
    short_name: "Habit Coach",
    description: "A calm habit coach that learns from your own logs.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3eef9",
    theme_color: "#241a3e",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}