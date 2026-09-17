import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

// 后端 API 端口。8038 取自本工作区后端端口段的预留位；
// 不要改成 8037，那个端口被相邻项目 railway_sign 的 API 占用。
const API_PORT = process.env.API_PORT || 8038
const API_TARGET = process.env.VITE_API_TARGET || `http://127.0.0.1:${API_PORT}`

/**
 * /api 代理。两处关键点：
 *
 * 1. 必须同时挂到 server 和 preview。只配 server 的话，`npm run build && npm run preview`
 *    下所有接口都会 404/502。
 * 2. 必须剥掉 Origin 头。Ollama 0.19 会对带 Origin 的请求直接返回 403
 *    （已实测），而流式对话要经过这条链路。
 */
const apiProxy = {
  '/api': {
    target: API_TARGET,
    changeOrigin: true,
    ws: true,
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.removeHeader('origin')
      })
    },
  },
}

export default defineConfig({
  plugins: [vue(), cesium()],
  server: {
    host: '0.0.0.0',
    port: 4029,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    host: '0.0.0.0',
    port: 4029,
    strictPort: true,
    proxy: apiProxy,
  },
  build: {
    target: 'esnext',
  },
})
