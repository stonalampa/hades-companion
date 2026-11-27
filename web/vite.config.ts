import { rmSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    {
      // public/local/ holds game text copied from the player's install.
      // It is for local dev only and must never ship in a build.
      name: 'strip-local-game-text',
      apply: 'build',
      closeBundle() {
        rmSync('dist/local', { recursive: true, force: true })
      },
    },
  ],
  // Datasets live in ../data, outside the app root.
  server: {
    fs: { allow: ['..'] },
    // Server edition in dev: `go run ./server` on :8080. Without it the app runs static.
    proxy: { '/api': 'http://127.0.0.1:8080', '/mcp': 'http://127.0.0.1:8080' },
  },
})
