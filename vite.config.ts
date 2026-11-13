import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base relativa: o mesmo build funciona no GitHub Pages (/pulso/) e em qualquer outro caminho
export default defineConfig({
  base: './',
  plugins: [react()],
  // o maior pedaço é o exceljs (~930 kB), baixado só quando alguém exporta Excel
  build: { chunkSizeWarningLimit: 1000 },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 60_000 },
});
