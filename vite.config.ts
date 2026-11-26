import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.{test,spec}.{js,ts,tsx}'] },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/recharts/') || id.includes('/node_modules/d3-')) return 'charts';
          if (id.includes('/node_modules/@supabase/') || id.includes('/node_modules/@tanstack/')) return 'backend';
        },
      },
    },
  },
});
