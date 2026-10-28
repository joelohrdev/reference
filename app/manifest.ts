import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Reference Studio",
    short_name: "Reference",
    description:
      "Study a reference photo with composition grids, perspective guides, sighting tools, value views and a watercolor mixer.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0f0f0f",
    theme_color: "#0f0f0f",
    categories: ["productivity", "education", "graphics"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
