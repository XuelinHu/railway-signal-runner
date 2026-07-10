<template>
  <main class="role-page">
    <section class="role-hero">
      <div>
        <span class="role-kicker">Railway Signal Runner</span>
        <h1>第一人称铁道信号巡检仿真实训平台</h1>
        <p>选择身份后进入对应工作流：老师布置数字孪生巡检场景，学生随机抽取任务进行第一人称训练。</p>
      </div>
      <div class="role-actions">
        <RouterLink class="role-entry teacher" to="/teacher">
          <strong>老师端</strong>
          <span>布置模型、保存多个训练场景</span>
        </RouterLink>
        <RouterLink class="role-entry student" to="/student">
          <strong>学生端</strong>
          <span>随机抽取任务并进入巡检练习</span>
        </RouterLink>
      </div>
    </section>
  </main>
</template>
