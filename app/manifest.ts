import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gym Log",
    short_name: "Gym Log",
    description: "Mobiler Trainingsplaner und Workout-Logger für Krafttraining.",
    start_url: "/",
    display: "standalone",
    background_color: "#fff7ed",
    theme_color: "#fff7ed",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
