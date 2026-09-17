<script setup>
/**
 * 管理台外壳：左侧菜单 + 顶栏 + 内容区。
 * 九个菜单对应 router.js 里 /admin 下的九个子路由。
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Activity,
  Bot,
  FileClock,
  Gauge,
  LayoutGrid,
  ListChecks,
  Map,
  ScrollText,
  Settings,
  Users,
} from '@lucide/vue'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const menus = [
  { name: 'admin-dashboard', path: '/admin/dashboard', label: '概览', icon: Gauge },
  { name: 'admin-users', path: '/admin/users', label: '用户管理', icon: Users },
  { name: 'admin-login-logs', path: '/admin/login-logs', label: '登录日志', icon: FileClock },
  { name: 'admin-scenes', path: '/admin/scenes', label: '训练场景', icon: Map },
  { name: 'admin-records', path: '/admin/records', label: '成绩记录', icon: ListChecks },
  { name: 'admin-conversations', path: '/admin/conversations', label: 'AI 会话', icon: Bot },
  { name: 'admin-ai-logs', path: '/admin/ai-logs', label: 'AI 调用日志', icon: Activity },
  { name: 'admin-models', path: '/admin/models', label: '模型管理', icon: LayoutGrid },
  { name: 'admin-system', path: '/admin/system', label: '系统设置', icon: Settings },
]

const sidebarOpen = ref(false)

const currentLabel = computed(
  () => menus.find((menu) => menu.name === route.name)?.label ?? '管理台'
)

async function logout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-sidebar" :class="{ open: sidebarOpen }">
      <div class="admin-brand">
        <ScrollText :size="20" />
        <div>
          <strong>管理台</strong>
          <small>铁道信号巡检平台</small>
        </div>
      </div>

      <nav class="admin-nav">
        <RouterLink
          v-for="menu in menus"
          :key="menu.name"
          :to="menu.path"
          class="admin-nav-item"
          :class="{ active: route.name === menu.name }"
          @click="sidebarOpen = false"
        >
          <component :is="menu.icon" :size="17" />
          <span>{{ menu.label }}</span>
        </RouterLink>
      </nav>

      <div class="admin-sidebar-foot">
        <RouterLink class="admin-nav-item" to="/">
          <Map :size="17" />
          <span>返回前台</span>
        </RouterLink>
      </div>
    </aside>

    <div class="admin-main">
      <header class="admin-topbar">
        <button class="admin-menu-toggle" type="button" @click="sidebarOpen = !sidebarOpen">☰</button>
        <div class="admin-breadcrumb">
          <span>管理台</span>
          <i>/</i>
          <strong>{{ currentLabel }}</strong>
        </div>
        <div class="admin-user">
          <span>{{ auth.displayName }}</span>
          <em>{{ auth.roleLabel }}</em>
          <button class="btn-ghost" type="button" @click="logout">退出登录</button>
        </div>
      </header>

      <section class="admin-content">
        <RouterView />
      </section>
    </div>
  </div>
</template>
