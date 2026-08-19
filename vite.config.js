import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api/ollama': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
      },
      '/api/record': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      '/api/video': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      '/api/edit': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8081',
        ws: true,
        changeOrigin: true,
      },
      '/api/projects': {
        target: 'http://localhost:8082',
        changeOrigin: true,
      },
      '/api/upload': {
        target: 'http://localhost:8082',
        changeOrigin: true,
      },
      '/api/jobs': {
        target: 'http://localhost:8082',
        changeOrigin: true,
      },
      '/api/videos': {
        target: 'http://localhost:8082',
        changeOrigin: true,
      },
      '/api/thumbnails': {
        target: 'http://localhost:8082',
        changeOrigin: true,
      },
      '/api/thumbnail': {
        target: 'http://localhost:8082',
        changeOrigin: true,
      },
    },
  },
})
