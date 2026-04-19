import lit from "@astrojs/lit";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  integrations: [lit()],
  vite: {
    // Open Props ships plain CSS — no extra build steps needed.
    // css.preprocessorOptions is intentionally omitted.
  },
});
