import { defineConfig } from 'vite';

// Single dev entry point that puts every Vite tool on one origin so they can
// share IndexedDB, localStorage, and sessionStorage. Navigate to:
//   http://localhost:5310/sparcd-exploration/uploader/
//   http://localhost:5310/sparcd-exploration/tagger/
//
// Both Vite servers must already be running (or run `pnpm dev` from the repo
// root, which starts everything in parallel via Turborepo).
export default defineConfig({
  server: {
    port: 5310,
    proxy: {
      '/sparcd-exploration/uploader': {
        target: 'http://localhost:5311',
        ws: true,
        changeOrigin: true,
      },
      '/sparcd-exploration/tagger': {
        target: 'http://localhost:5312',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
