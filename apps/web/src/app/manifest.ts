import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EVAVO Storyteller Studio",
    short_name: "Storyteller",
    description: "Private long-form narration and illustrated storytelling production workspace.",
    start_url: "/",
    display: "standalone",
    background_color: "#080808",
    theme_color: "#080808",
    orientation: "any",
    categories: ["productivity", "music", "entertainment"],
  };
}
