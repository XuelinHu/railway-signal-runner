import { createRouter, createWebHashHistory } from 'vue-router'
import RoleSelect from './views/RoleSelect.vue'
import TeacherStudio from './views/TeacherStudio.vue'
import StudentHub from './views/StudentHub.vue'
import StudentTraining from './views/StudentTraining.vue'
import AccountView from './views/AccountView.vue'
import { useAuthStore } from './stores/auth'

/**
 * 路由分成三块：
 * - 公共服务（登录/注册/找回/重置/账号中心）：不登录也能打开
 * - 前台业务（身份选择/老师端/学生端/训练）：沿用原有免登录流程，登录与否都能用
 * - 管理台 /admin/**：必须登录且角色为 admin
 *
 * 前端守卫只负责体验（不让人看到进不去的页面），真正的权限在每个接口上由服务端复核。
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'role-select', component: RoleSelect },
    { path: '/teacher', name: 'teacher-studio', component: TeacherStudio },
    { path: '/student', name: 'student-hub', component: StudentHub },
    { path: '/student/training/:sceneId', name: 'student-training', component: StudentTraining, props: true },

    // 公共服务。AuthLayout 只提供居中的卡片外壳，本身不做鉴权。
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/auth/LoginView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('./views/auth/RegisterView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('./views/auth/ForgotPasswordView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/reset-password/:token?',
      name: 'reset-password',
      component: () => import('./views/auth/ResetPasswordView.vue'),
      props: true,
    },
    {
      path: '/account',
      name: 'account',
      component: AccountView,
      meta: { requiresAuth: true },
    },

    // 管理台：懒加载 + 每个菜单一条子路由
    {
      path: '/admin',
      component: () => import('./components/admin/AdminLayout.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
      children: [
        { path: '', redirect: { name: 'admin-dashboard' } },
        {
          path: 'dashboard',
          name: 'admin-dashboard',
          component: () => import('./views/admin/DashboardView.vue'),
          meta: { title: '概览' },
        },
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('./views/admin/UsersView.vue'),
          meta: { title: '用户管理' },
        },
        {
          path: 'login-logs',
          name: 'admin-login-logs',
          component: () => import('./views/admin/LoginLogsView.vue'),
          meta: { title: '登录日志' },
        },
        {
          path: 'scenes',
          name: 'admin-scenes',
          component: () => import('./views/admin/ScenesView.vue'),
          meta: { title: '训练场景' },
        },
        {
          path: 'records',
          name: 'admin-records',
          component: () => import('./views/admin/RecordsView.vue'),
          meta: { title: '成绩记录' },
        },
        {
          path: 'conversations',
          name: 'admin-conversations',
          component: () => import('./views/admin/ConversationsView.vue'),
          meta: { title: 'AI 会话' },
        },
        {
          path: 'ai-logs',
          name: 'admin-ai-logs',
          component: () => import('./views/admin/AiLogsView.vue'),
          meta: { title: 'AI 调用日志' },
        },
        {
          path: 'models',
          name: 'admin-models',
          component: () => import('./views/admin/ModelsView.vue'),
          meta: { title: '模型管理' },
        },
        {
          path: 'system',
          name: 'admin-system',
          component: () => import('./views/admin/SystemView.vue'),
          meta: { title: '系统设置' },
        },
      ],
    },
  ],
})

/**
 * 全局前置守卫。
 *
 * hydrate() 只在首次导航时真正打接口（store 内部有 promise 单例），
 * 它用 /auth/me 复核 localStorage 里的快照——令牌可能已经被服务端吊销，
 * 不能只信本地那份 user。
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.hydrate()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    // 带上原地址，登录后回到用户本来想去的页面。
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.roles?.length && !to.meta.roles.includes(auth.user?.role)) {
    return { name: 'role-select' }
  }

  // 已登录的人不该再看到登录/注册页；但重置密码页要放行（可能刚被管理员踢下线）。
  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: auth.isAdmin ? 'admin-dashboard' : 'account' }
  }

  return true
})
