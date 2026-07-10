<template>
  <span ref="rootRef" class="model-thumb-render" :class="`is-${status}`">
    <img v-if="status === 'ready'" :src="thumbnailUrl" :alt="`${label} 3D 模型缩略图`" />
    <LoaderCircle v-else-if="status === 'loading'" class="model-thumb-spinner" :size="24" aria-label="模型缩略图加载中" />
    <ImageOff v-else-if="status === 'error'" :size="22" aria-label="模型缩略图加载失败" />
  </span>
</template>

<script setup>
import { ImageOff, LoaderCircle } from '@lucide/vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { generateModelThumbnail } from '../game/modelThumbnailRenderer'

const props = defineProps({
  url: {
    type: String,
    required: true
  },
  label: {
    type: String,
    default: ''
  }
})

const thumbnailUrl = ref('')
const rootRef = ref(null)
const status = ref('idle')
let observer
let requestId = 0

onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer.disconnect()
    loadThumbnail()
  }, { rootMargin: '120px' })
  observer.observe(rootRef.value)
})

onBeforeUnmount(() => {
  requestId += 1
  observer?.disconnect()
})

watch(() => props.url, () => {
  requestId += 1
  thumbnailUrl.value = ''
  status.value = 'idle'
  observer?.disconnect()
  if (rootRef.value) {
    observer?.observe(rootRef.value)
  }
})

async function loadThumbnail() {
  if (status.value === 'loading' || status.value === 'ready') return
  const currentRequest = ++requestId
  status.value = 'loading'
  try {
    const result = await generateModelThumbnail(props.url)
    if (currentRequest !== requestId) return
    thumbnailUrl.value = result
    status.value = 'ready'
  } catch {
    if (currentRequest !== requestId) return
    thumbnailUrl.value = ''
    status.value = 'error'
  }
}
</script>
