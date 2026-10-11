import { defineConfig } from 'vite'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

// 后端 API 端口。8038 取自本工作区后端端口段的预留位；
// 不要改成 8037，那个端口被相邻项目 railway_sign 的 API 占用。
const API_PORT = process.env.API_PORT || 8038
const API_TARGET = process.env.VITE_API_TARGET || `http://127.0.0.1:${API_PORT}`
const useHttps = process.env.DEV_HTTPS === '1'
const httpsPort = 4092
const tlsDirectory = resolve(process.cwd(), '../identity-service/tls/apps/railway-signal-runner')
const tlsCert = resolve(tlsDirectory, 'server.crt')
const tlsKey = resolve(tlsDirectory, 'server.key')

if (useHttps && !(existsSync(tlsCert) && existsSync(tlsKey))) {
  throw new Error(`HTTPS requires the LAN development certificate in ${tlsDirectory}`)
}

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

const preserveReleaseApk = {
  name: 'preserve-release-apk',
  apply: 'build',
  closeBundle() {
    const source = resolve('android/app/build/outputs/apk/release/app-release.apk')
    if (!existsSync(source)) return

    const outputDirectory = resolve('dist')
    mkdirSync(outputDirectory, { recursive: true })
    copyFileSync(source, resolve(outputDirectory, 'signal-runner-release.apk'))
  },
}

export default defineConfig({
  plugins: [vue(), cesium(), preserveReleaseApk],
  server: {
    host: '0.0.0.0',
    port: useHttps ? httpsPort : 4029,
    strictPort: true,
    ...(useHttps ? { https: { cert: tlsCert, key: tlsKey } } : {}),
    proxy: apiProxy,
  },
  preview: {
    host: '0.0.0.0',
    port: useHttps ? httpsPort : 4029,
    strictPort: true,
    ...(useHttps ? { https: { cert: tlsCert, key: tlsKey } } : {}),
    proxy: apiProxy,
  },
  build: {
    target: 'esnext',
  },
})
