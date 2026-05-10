import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

// Read version from package.json so the UI badge stays in sync with
// every release, and stamp the build date so it's obvious what's live.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
const buildDate = new Date().toISOString().slice(0, 10)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD_DATE__: JSON.stringify(buildDate),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3080',
    },
  },
})
