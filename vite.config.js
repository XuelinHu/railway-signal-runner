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
let localDevServer = false
const localDevOnlyProxy = {
  name: 'local-dev-only-proxy',
  configureServer(server) {
    server.httpServer?.once('listening', () => {
      const address = server.httpServer.address()
      localDevServer = typeof address !== 'string' &&
        (address?.address === '127.0.0.1' || address?.address === '::1')
    })
  },
}
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
      proxy.on('proxyReq', (proxyReq, req) => {
        proxyReq.removeHeader('origin')
        proxyReq.removeHeader('x-rsr-dev-local')
        const remote = req.socket.remoteAddress
        const host = req.headers.host || ''
        if (localDevServer && (remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1') &&
            /^(?:localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host)) {
          proxyReq.setHeader('x-rsr-dev-local', '1')
        }
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
  plugins: [vue(), cesium(), preserveReleaseApk, localDevOnlyProxy],
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
