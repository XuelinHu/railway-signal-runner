<script setup>
/**
 * 时间区间筛选。
 *
 * 输入框里是本地时间串（datetime-local 的原生格式），发给后端的是 ISO，
 * 因为后端按 timestamptz 比较，本地串会被当成 UTC 解析而整体偏移时区。
 * 这个换算在登录日志 / AI 调用日志 / 审计日志三处都要用，所以抽出来。
 */
import { ref, watch } from 'vue'

const props = defineProps({
  from: { type: String, default: '' },
  to: { type: String, default: '' },
})

const emit = defineEmits(['change'])

/** ISO → datetime-local 需要的本地串（YYYY-MM-DDTHH:mm）。 */
function toLocalInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** datetime-local 的本地串 → ISO。 */
function toIso(local) {
  if (!local) return ''
  const date = new Date(local)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

const fromLocal = ref(toLocalInput(props.from))
const toLocal = ref(toLocalInput(props.to))

// 外部（如「重置」按钮）清空 filters 时，输入框要跟着回空。
watch(
  () => [props.from, props.to],
  ([nextFrom, nextTo]) => {
    if (toIso(fromLocal.value) !== (nextFrom || '')) fromLocal.value = toLocalInput(nextFrom)
    if (toIso(toLocal.value) !== (nextTo || '')) toLocal.value = toLocalInput(nextTo)
  }
)

function emitChange() {
  emit('change', { from: toIso(fromLocal.value), to: toIso(toLocal.value) })
}
</script>

<template>
  <label class="filter-item">
    起
    <input v-model="fromLocal" type="datetime-local" @change="emitChange" />
  </label>
  <label class="filter-item">
    止
    <input v-model="toLocal" type="datetime-local" @change="emitChange" />
  </label>
</template>
