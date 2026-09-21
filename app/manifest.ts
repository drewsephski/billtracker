import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Homeshare",
    short_name: "Homeshare",
    description: "Shared home. Clear bills. Settle up together.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f7f7fa",
    theme_color: "#f7f7fa",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
