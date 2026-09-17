import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './styles/global.css'
// 平台层（登录/账号/管理台/智能体/语音）独立一份，避免改动游戏本体的样式。
import './styles/platform.css'

createApp(App).use(createPinia()).use(router).mount('#app')
