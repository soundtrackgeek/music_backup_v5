import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/AlbumCovers/**",
        "**/CSV/**",
        "**/CSV_ALBUMS/**",
        "**/CSV_SINGLES/**",
        "**/CSV_ALBUMS_UK/**",
        "**/CSV_SINGLES_UK/**",
        "**/CSV_ALBUMS_NO/**",
        "**/CSV_SINGLES_NO/**",
        "**/CSV_TIISKUDDET_NO/**",
        "**/CSV_NORSKTOPPEN_NO/**",
        "**/MusicBrainz/**",
        "**/musicbee-library.tsv",
        "**/dist/**",
      ],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
});

