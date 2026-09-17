<script setup>
/**
 * 应用根组件。
 *
 * 智能体弹框与悬浮球挂在这里而不是各个页面里，保证：
 * - 任何页面（含全屏的游戏训练页）都能唤起它；
 * - 切换路由时弹框状态不丢，用户可以边看场景边问。
 *
 * 认证彻底失效时（刷新令牌也被吊销）由 client.js 通知 store，这里负责把用户送回登录页。
 */
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AgentDialog from './components/agent/AgentDialog.vue'
import AgentLauncher from './components/agent/AgentLauncher.vue'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
const router = useRouter()

onMounted(() => {
  auth.setSignedOutHandler(() => {
    // 只在需要登录的页面上跳，避免把正在免登录练习的学生踢出去。
    if (router.currentRoute.value.meta.requiresAuth) {
      router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
    }
  })
})
</script>

<template>
  <RouterView />
  <AgentLauncher />
  <AgentDialog />
</template>
