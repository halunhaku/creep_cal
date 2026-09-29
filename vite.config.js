import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
