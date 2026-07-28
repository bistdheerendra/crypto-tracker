import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dheerendra Intelligence",
    short_name: "DeepCurrent",
    description:
      "See the cause behind every market move. Four independent analysis lanes. One synthesized verdict.",
    start_url: "/",
    display: "standalone",
    background_color: "#03060f",
    theme_color: "#03060f",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
