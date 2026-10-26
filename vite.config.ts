/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'api-sync-dev-server',
      configureServer(server) {
        let devSyncData: string | null = null;
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/sync') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
              res.statusCode = 204;
              res.end();
              return;
            }

            if (req.method === 'GET') {
              res.statusCode = 200;
              res.end(devSyncData || JSON.stringify({ empty: true }));
              return;
            }

            if (req.method === 'POST' || req.method === 'PUT') {
              let body = '';
              req.on('data', (chunk) => {
                body += chunk;
              });
              req.on('end', () => {
                devSyncData = body;
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, timestamp: Date.now() }));
              });
              return;
            }
          }
          next();
        });
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false,
      },
      workbox: {
        // Cache do app shell + assets
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // Cache de runtime: assets JS/CSS sempre frescos
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          // Banco de questões (public/questoes): NÃO entra no pré-cache do app.
          // Cada matéria é guardada só depois de aberta; assim funciona offline
          // sem baixar ~110 MB de uma vez.
          {
            urlPattern: ({ url }: { url: URL }) =>
              url.pathname.startsWith('/questoes/') && url.pathname.endsWith('.json'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'questoes-json',
              expiration: { maxEntries: 40 },
            },
          },
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/questoes/img/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'questoes-img',
              expiration: { maxEntries: 3000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Não redireciona navegação — roda como SPA puro offline
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'MedTracker — Estudos para Residência',
        short_name: 'MedTracker',
        description: 'App pessoal de estudos para residência médica. Offline-first.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        categories: ['education', 'medical'],
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
  },
});
