<script setup>
/**
 * 列定义驱动的数据表格。
 *
 * 列定义形如：{ key, label, width, sortable, align, format }
 * - format(value, row) 返回展示文本，返回 null/undefined 时显示占位符
 * - 需要自定义渲染时用 #cell-<key> 插槽，行操作用 #row-actions
 */
defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  emptyText: { type: String, default: '暂无数据' },
  rowKey: { type: String, default: 'id' },
  sort: { type: String, default: '' },
  order: { type: String, default: 'desc' },
})

const emit = defineEmits(['sort'])

function cellText(column, row) {
  const raw = row[column.key]
  if (typeof column.format === 'function') return column.format(raw, row)
  if (raw === null || raw === undefined || raw === '') return '—'
  return String(raw)
}

function sortMark(column) {
  if (column.key !== sort) return ''
  return order === 'asc' ? '↑' : '↓'
}
</script>

<template>
  <div class="data-table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            :style="column.width ? { width: column.width } : undefined"
            :class="{ sortable: column.sortable, [`align-${column.align}`]: column.align }"
            @click="column.sortable && emit('sort', column.key)"
          >
            {{ column.label }}<span v-if="column.sortable" class="sort-mark">{{ sortMark(column) }}</span>
          </th>
          <th v-if="$slots['row-actions']" class="align-right">操作</th>
        </tr>
      </thead>

      <tbody>
        <tr v-if="loading">
          <td :colspan="columns.length + ($slots['row-actions'] ? 1 : 0)" class="table-state">加载中…</td>
        </tr>
        <tr v-else-if="error">
          <td :colspan="columns.length + ($slots['row-actions'] ? 1 : 0)" class="table-state error">
            {{ error }}
          </td>
        </tr>
        <tr v-else-if="rows.length === 0">
          <td :colspan="columns.length + ($slots['row-actions'] ? 1 : 0)" class="table-state">
            {{ emptyText }}
          </td>
        </tr>
        <tr v-for="row in rows" v-else :key="row[rowKey]">
          <td
            v-for="column in columns"
            :key="column.key"
            :class="[`align-${column.align}`]"
          >
            <slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">
              {{ cellText(column, row) }}
            </slot>
          </td>
          <td v-if="$slots['row-actions']" class="align-right row-actions">
            <slot name="row-actions" :row="row" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
