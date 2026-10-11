import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { authApi } from './api/auth'
import { saveSession } from './api/tokenStore'
import './styles/global.css'
// 平台层（登录/账号/管理台/智能体/语音）独立一份，避免改动游戏本体的样式。
import './styles/platform.css'

async function bootstrap() {
  const params = new URLSearchParams(window.location.search)
  if (params.has('code') || params.has('error')) {
    try {
      if (params.has('error')) throw new Error('统一登录未完成')
      const result = await authApi.oidcCallback({ code: params.get('code'), state: params.get('state') })
      if (result.mode === 'login') saveSession(result)
      window.history.replaceState(null, '', `${window.location.origin}/`)
      window.location.hash = result.mode === 'link' ? '/account' : '/'
    } catch (error) {
      sessionStorage.setItem('rsr.oidcError', error?.message || '统一登录失败')
      window.history.replaceState(null, '', `${window.location.origin}/`)
      window.location.hash = '/login'
    }
  }
  const app = createApp(App).use(createPinia()).use(router)
  app.mount('#app')
}

bootstrap()
