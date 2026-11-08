<script setup>
/**
 * 全局悬浮球：点一下就把智能体弹框调出来。
 *
 * 只在「没有弹框」时显示，避免弹框开着的时候右下角还浮一个按钮。
 * 游戏内的唤起按钮在 RailwayFpsGame 的动作组里，两者共用同一个 store。
 */
import { Bot, Image } from '@lucide/vue'
import { useAgentStore } from '../../stores/agent'

const agent = useAgentStore()
const imagegenUrl = typeof window === 'undefined' ? '' : `http://${window.location.hostname}:4050/`
</script>

<template>
  <a class="imagegen-link" :href="imagegenUrl" target="_blank" rel="noopener noreferrer" title="AI 绘画" aria-label="AI 绘画"><Image :size="18" /></a>
  <button
    v-if="!agent.open"
    class="agent-fab"
    type="button"
    title="打开信号巡检助手"
    @click="agent.toggle(true)"
  >
    <Bot :size="18" />
    <span>智能体</span>
  </button>
</template>

<style scoped>
.imagegen-link { position: fixed; right: 22px; bottom: 86px; z-index: 1001; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 6px; background: #126a62; color: white; }
@media (max-width: 760px) {
  .imagegen-link { display: none; }
}
</style>
