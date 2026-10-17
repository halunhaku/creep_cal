import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { bundleGuardPlugin } from './scripts/bundleGuard.mjs';

export default defineConfig({
  plugins: [
    react(),
    // Fails `npm run build` if a Node-only module reaches the browser bundle. See
    // scripts/bundleGuard.mjs for why the check reads the module graph instead of
    // the source, and what it can and cannot tell you.
    bundleGuardPlugin(),
  ],
  build: {
    rollupOptions: {
      output: {
        /*
         * Chunk grouping for the heavy dependencies.
         *
         * There is deliberately no group for recharts/d3. Grouping them by name
         * read well and measured badly: with a `charts` group rolldown folded
         * `react/index.js` and `react-dom/index.js` into it — the default exports
         * of react are only reachable through recharts, so the group absorbed
         * them — and because the app's own eager code imports named React APIs,
         * the whole 353 kB chart chunk became a *static* import of the entry and
         * was modulepreloaded on first paint. Measured by `scripts/benchmark.mjs`:
         * initial payload 180.4 KiB gzip before, ~85 KiB after, with the charts
         * still shared between the two lazy workspaces that use them.
         *
         * `first-load-single` and the bundle table in the benchmark report are the
         * scenarios that show it; re-adding a chart group is what breaks it again.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'react';
          if (id.includes('/katex/')) return 'equations';
          if (id.includes('/papaparse/') || id.includes('/read-excel-file/') || id.includes('/fflate/')) {
            return 'spreadsheet';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
  },
});
