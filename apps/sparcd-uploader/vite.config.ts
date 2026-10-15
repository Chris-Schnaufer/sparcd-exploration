import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// Workspace packages are consumed as TypeScript source (no dist/). Aliasing
// them to their src entry lets Vite transpile them as app source.
const pkg = (name: string, entry: string) =>
  fileURLToPath(new URL(`../../packages/${name}/src/${entry}`, import.meta.url));

const scope = '/sparcd-exploration/uploader/';

export default defineConfig({
  // Served from a subpath on GitHub Pages: culverlab.github.io/sparcd-exploration/uploader/
  base: scope,
  server: { port: 5311 },
  plugins: [
    react(),
    VitePWA({
      // A run can take minutes; swapping the service worker underneath one in
      // progress is not something to do silently. `prompt` leaves the update
      // staged until App.tsx's toast asks the person to reload for it.
      registerType: 'prompt',
      // Lets `pnpm dev` (and this app's BDD suite) register a real service
      // worker instead of only the production build.
      devOptions: { enabled: true, type: 'module' },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: "SPARC'd · Uploader",
        short_name: 'Uploader',
        description: 'Upload camera-trap images to a SPARC’d collection.',
        start_url: scope,
        scope,
        display: 'standalone',
        background_color: '#f4ecd8',
        theme_color: '#1c1a14',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Includes the fileProcessor Web Worker's built chunk — Inspect must
        // start it without a network fetch for the offline suite to pass.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  // The dep scanner doesn't follow Web Workers, so exifr and hash-wasm (only
  // imported by fileProcessor.worker.ts) were discovered on first use and made
  // Vite re-bundle and reload every open page mid-run.
  optimizeDeps: { include: ['exifr', 'hash-wasm'] },
  resolve: {
    alias: {
      '@sparcd/types': pkg('types', 'index.ts'),
      '@sparcd/s3-safe': pkg('s3-safe', 'index.ts'),
      '@sparcd/auth-ui': pkg('auth-ui', 'index.ts'),
      '@sparcd/camtrap': pkg('camtrap', 'index.ts'),
      '@sparcd/flip': pkg('flip', 'index.ts'),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Vitest reads this file too. `bddgen` emits Playwright specs under
  // features/.features-gen/, which match Vitest's default `*.spec.js` glob —
  // keep the unit suite out of them.
  test: {
    exclude: [...configDefaults.exclude, 'features/.features-gen/**', 'features/.features-gen-offline/**', 'bench/**'],
  },
});
