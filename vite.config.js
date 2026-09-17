import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

export default defineConfig({
  plugins: [vue(), cesium()],
  server: {
    host: '0.0.0.0',
    port: 4029,
    strictPort: true
  },
  preview: {
    host: '0.0.0.0',
    port: 4029,
    strictPort: true
  },
  build: {
    target: 'esnext'
  }
})
