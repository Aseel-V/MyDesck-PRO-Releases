import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageVersion = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'pwa-icon.svg'],
      manifest: {
        name: 'MyDesck PRO',
        short_name: 'MyDesck',
        description: 'Multilingual business operations platform for industry-specific workflows.',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '256x256',
            type: 'image/png',
          },
          {
            src: 'pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4MB
        // Fix: Exclude sitemap, version metadata, and html files from SPA navigation fallback
        navigateFallbackDenylist: [
          /^\/sitemap\.xml$/,
          /^\/robots\.txt$/,
          /^\/version\.json$/,
          /^\/release-notes\.json$/,
          /^.*\.html$/
        ],
      },
    }),
  ],
  // CRITICAL FIX: Ensure relative paths for Electron
  base: './',
  optimizeDeps: {
    // Pre-bundle these heavy dependencies for faster startup
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'lucide-react',
    ],
  },
  server: {
    // Allow access from other devices on the LAN during debugging/testing.
    host: '0.0.0.0',
    // Faster file watching (especially for OneDrive paths)
    watch: {
      usePolling: false,
      interval: 1000,
    },
    // Faster HMR
    hmr: {
      overlay: true,
    },
    // Pre-warm frequently used files
    warmup: {
      clientFiles: ['./src/main.tsx', './src/web-main.tsx'],
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.woff', '**/*.woff2', '**/*.ttf', '**/*.otf'],
  build: {
    // Ensure output goes to dist
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion),
  },
});
