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
    // The jsdom UI workflow tests take about 1 s on an idle machine, so the 5 s
    // default left too little headroom when CI or a local Rust build is busy.
    testTimeout: 20_000,
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
        "**/Charts/**",
        "**/MusicBrainz/**",
        "**/musicbee-library.tsv",
        "**/dist/**",
      ],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
});

