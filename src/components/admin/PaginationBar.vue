<script setup>
/**
 * 分页条。管理台每个菜单都用它，保证"每个菜单都能分页"这件事由组件兜住，
 * 而不是靠每个页面各写一遍。
 */
import { computed } from 'vue'
import { PAGE_SIZES } from '../../api/pagination'

const props = defineProps({
  page: { type: Number, required: true },
  pageSize: { type: Number, required: true },
  total: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['change', 'size-change'])

// 页码窗口：总页数很多时只显示当前页附近的几页，避免撑破布局。
const pageWindow = computed(() => {
  const last = props.totalPages
  const current = props.page
  const span = 2
  const start = Math.max(1, Math.min(current - span, last - span * 2))
  const end = Math.min(last, Math.max(current + span, span * 2 + 1))
  const pages = []
  for (let i = start; i <= end; i += 1) pages.push(i)
  return pages
})

const rangeText = computed(() => {
  if (props.total === 0) return '共 0 条'
  const from = (props.page - 1) * props.pageSize + 1
  const to = Math.min(props.page * props.pageSize, props.total)
  return `第 ${from}-${to} 条 / 共 ${props.total} 条`
})

function go(target) {
  if (props.disabled) return
  const next = Math.min(Math.max(1, target), Math.max(1, props.totalPages))
  if (next !== props.page) emit('change', next)
}

function changeSize(event) {
  const size = Number(event.target.value)
  if (size !== props.pageSize) emit('size-change', size)
}
</script>

<template>
  <div class="pagination-bar">
    <span class="pagination-total">{{ rangeText }} · 第 {{ page }}/{{ totalPages }} 页</span>

    <div class="pagination-controls">
      <label class="pagination-size">
        每页
        <select :value="pageSize" :disabled="disabled" @change="changeSize">
          <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
        </select>
        条
      </label>

      <button type="button" :disabled="disabled || page <= 1" @click="go(1)">首页</button>
      <button type="button" :disabled="disabled || page <= 1" @click="go(page - 1)">上一页</button>

      <button
        v-for="p in pageWindow"
        :key="p"
        type="button"
        class="pagination-page"
        :class="{ active: p === page }"
        :disabled="disabled"
        @click="go(p)"
      >
        {{ p }}
      </button>

      <button type="button" :disabled="disabled || page >= totalPages" @click="go(page + 1)">下一页</button>
      <button type="button" :disabled="disabled || page >= totalPages" @click="go(totalPages)">末页</button>
    </div>
  </div>
</template>
