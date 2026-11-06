import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// why: the core package is consumed as source so dev/build need no prior build.
const coreAlias = {
  "@thermopulse/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: coreAlias,
  },
});
