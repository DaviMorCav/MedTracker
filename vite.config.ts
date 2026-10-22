/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'MedTracker',
        short_name: 'MedTracker',
        description: 'App de estudos para residência médica',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: []
      }
    })
  ],
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true
  }
});
