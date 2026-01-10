import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    return {
      base: '/FinanceFlow/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['icons/apple-touch-icon.png'],
          manifestFilename: 'manifest.webmanifest',
          manifest: {
            name: 'FinanceFlow',
            short_name: 'FinanceFlow',
            start_url: '/FinanceFlow/',
            scope: '/FinanceFlow/',
            display: 'standalone',
            theme_color: '#111827',
            background_color: '#111827',
            icons: [
              {
                src: 'icons/icon-192.png',
                sizes: '192x192',
                type: 'image/png',
              },
              {
                src: 'icons/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
              },
              {
                src: 'icons/icon-512-maskable.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable',
              },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,ico}'],
            cleanupOutdatedCaches: true,
            clientsClaim: true,
            skipWaiting: true,
          },
        }),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
