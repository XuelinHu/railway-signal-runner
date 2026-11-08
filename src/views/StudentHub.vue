<template>
  <main class="student-page">
    <header class="student-header">
      <RouterLink to="/" class="back-link">返回身份选择</RouterLink>
      <div>
        <span>学生端</span>
        <h1>巡检任务练习</h1>
      </div>
      <div class="student-launch-actions">
        <button class="launch-button" type="button" :disabled="scenes.length === 0" @click="startDefault">进入默认实训</button>
        <button v-if="scenes.length > 1" class="tool-button" type="button" @click="startRandom">随机练习</button>
      </div>
    </header>

    <section v-if="scenes.length === 0" class="empty-scenes">
      <strong>暂无老师发布的训练场景</strong>
      <span>请先进入老师端布置、设置巡检点并发布至少一个场景。</span>
      <RouterLink class="tool-button primary" to="/teacher">进入老师端</RouterLink>
    </section>

    <section v-else class="scene-list">
      <article v-for="scene in scenes" :key="scene.id" class="scene-card" :class="{ 'default-scene': scene.id === DEFAULT_TRAINING_SCENE_ID }">
        <div>
          <small v-if="scene.id === DEFAULT_TRAINING_SCENE_ID">默认实训</small>
          <strong>{{ scene.name }}</strong>
          <span>
            {{ taskCount(scene) }} 个巡检点 · {{ difficultyText(scene.difficulty) }} ·
            {{ scene.estimatedMinutes || 10 }} 分钟 · {{ formatTime(scene.updatedAt) }}
          </span>
        </div>
        <RouterLink class="tool-button primary" :to="`/student/training/${scene.id}`">进入练习</RouterLink>
      </article>
    </section>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ensureDefaultTrainingScene, listPublishedTrainingScenes } from '../game/trainingSceneDb'
import { DEFAULT_TRAINING_SCENE_ID } from '../game/defaultTrainingScene.js'
import { sceneApi } from '../api/scenes.js'

const router = useRouter()
const scenes = ref([])

onMounted(loadScenes)

async function loadScenes() {
  await ensureDefaultTrainingScene()
  const local = await listPublishedTrainingScenes()
  const localById = new Map(local.map((scene) => [scene.id, scene]))
  let cloud = []
  try {
    cloud = (await sceneApi.list({ published: true, page: 1, pageSize: 50 })).items || []
  } catch {
    // 本地示范场景无需后端，也能直接进入训练。
  }
  scenes.value = [
    ...cloud.map((scene) => ({
      ...localById.get(scene.id),
      ...scene,
      updatedAt: scene.updated_at || scene.updatedAt,
    })),
    ...local.filter((scene) => !cloud.some((item) => item.id === scene.id)),
  ].sort((left, right) =>
    (left.id === DEFAULT_TRAINING_SCENE_ID ? -1 : 0) - (right.id === DEFAULT_TRAINING_SCENE_ID ? -1 : 0) ||
    String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))
  )
}

function startRandom() {
  if (scenes.value.length === 0) return
  const index = Math.floor(Math.random() * scenes.value.length)
  router.push(`/student/training/${scenes.value[index].id}`)
}

function startDefault() {
  router.push(`/student/training/${DEFAULT_TRAINING_SCENE_ID}`)
}

function formatTime(value) {
  return new Date(value).toLocaleString()
}

function taskCount(scene) {
  return scene.tasks?.length || scene.objects?.filter((object) => object.inspectionPoint).length || 0
}

function difficultyText(value) {
  return {
    easy: '基础',
    normal: '标准',
    hard: '进阶'
  }[value] || '标准'
}
</script>
