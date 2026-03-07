import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import process from 'node:process'

function getPagesBase() {
  const isPages = process.env.GITHUB_PAGES === 'true'
  const repo = process.env.GITHUB_REPOSITORY?.split('/')?.[1]
  if (isPages && repo) return `/${repo}/`
  return '/'
}

export default defineConfig({
  base: getPagesBase(),
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg', 'pwa-icon.svg'],
      manifest: {
        name: 'VIPO Vision — Surveillance Platform',
        short_name: 'VIPO Vision',
        description: 'VIPO Vision — Surveillance Platform',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        scope: getPagesBase(),
        start_url: getPagesBase(),
        icons: [
          {
            src: 'pwa-icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'pwa-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'pwa-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:5055',
      '/hls': 'http://localhost:5055',
    },
  },
})
