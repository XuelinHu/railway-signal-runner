<script setup>
/**
 * 登录/注册/找回密码共用的外壳。
 * 统一背景、卡片、返回入口，避免四个页面各写一套样式后走样。
 */
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
})
</script>

<template>
  <main class="auth-page">
    <section class="auth-card">
      <RouterLink class="auth-back" to="/">← 返回身份选择</RouterLink>
      <h1 class="auth-title">{{ title }}</h1>
      <p v-if="subtitle" class="auth-subtitle">{{ subtitle }}</p>
      <slot />
    </section>
    <p class="auth-footnote">第一人称铁道信号巡检仿真实训平台</p>
  </main>
</template>
