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
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'react';
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts';
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
