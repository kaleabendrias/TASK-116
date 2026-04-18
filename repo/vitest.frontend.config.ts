import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [svelte({ hot: false })] as never,
  resolve: {
    alias: {
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@application': fileURLToPath(new URL('./src/application', import.meta.url)),
      '@domain': fileURLToPath(new URL('./src/domain', import.meta.url)),
      '@persistence': fileURLToPath(new URL('./src/persistence', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url))
    }
  },
  test: {
    name: 'frontend',
    include: ['frontend_tests/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['frontend_tests/setup.ts'],
    reporters: ['default'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary'],
      reportsDirectory: 'coverage/frontend',
      include: [
        'src/main.ts',
        'src/ui/components/**',
        'src/ui/App.svelte',
        'src/ui/router.ts',
        'src/ui/routes/Home.svelte',
        'src/ui/routes/NotFound.svelte',
        'src/ui/routes/Login.svelte'
      ],
      exclude: ['**/*.d.ts', '**/ConfigTable.svelte'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90
      }
    }
  }
});
