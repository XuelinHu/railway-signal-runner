<script setup>
/**
 * 全局悬浮球：点一下就把智能体弹框调出来。
 *
 * 只在「没有弹框」时显示，避免弹框开着的时候右下角还浮一个按钮。
 * 游戏内的唤起按钮在 RailwayFpsGame 的动作组里，两者共用同一个 store。
 */
import { Bot } from '@lucide/vue'
import { useAgentStore } from '../../stores/agent'

const agent = useAgentStore()
</script>

<template>
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
