/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Tests run far from US Eastern on purpose: every time in the app means Susan's local time, taken
// from configuration (src/lib/timeZone.ts), never from the machine. Test-only: the dev server and
// build are unaffected.
if (process.env.VITEST) process.env.TZ = 'Pacific/Auckland';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      // Wait for the person to tap Refresh on the update banner (src/components/UpdateBanner.tsx).
      registerType: 'prompt',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: "Susan's Calendar",
        short_name: 'Calendar',
        description: "Susan's appointments, and the text reminders sent to her about them.",
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f2f3f1',
        theme_color: '#0f766e',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // App notification handlers (public/app-notifications-sw.js).
        importScripts: ['app-notifications-sw.js'],
        // Precache everything except the sign-in screen and its Amplify UI styles: it's only needed
        // when signed out, which needs the network anyway. Keeps each update small.
        globIgnores: ['**/node_modules/**/*', 'sw.js', 'workbox-*.js', '**/SignInScreen-*'],
      },
    }),
  ],
  build: {
    // Amplify's sign-in UI is large. It loads only when signed out.
    chunkSizeWarningLimit: 800,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'amplify/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
});
