import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { normalizePage } from '../api/pagination'

/**
 * 分页列表状态的唯一来源。管理台每个菜单都用它，保证翻页/筛选/排序行为一致。
 *
 * 三个容易踩的坑都在这里处理掉了：
 * 1. 乱序响应：快速改筛选会并发多个请求，先发的可能后到。用请求序号丢弃过期响应。
 * 2. 筛选抖动：输入框每敲一个字就发一次请求，用 300ms 防抖。
 * 3. 组件卸载：翻页翻到一半跳走，回调里还在写 ref。卸载时 abort 并停发。
 *
 * @param {(params: object) => Promise<any>} fetcher 接收 {page,pageSize,...filters}
 * @param {object} options
 * @param {number} [options.pageSize] 每页条数
 * @param {string} [options.sort] 初始排序字段
 * @param {string} [options.order] 初始排序方向
 * @param {boolean} [options.immediate] 是否立即加载，默认 true
 * @param {object} [options.initialFilters] 初始筛选条件
 */
export function usePagedQuery(fetcher, options = {}) {
  const {
    pageSize: initialPageSize = 20,
    sort: initialSort = '',
    order: initialOrder = 'desc',
    immediate = true,
    initialFilters = {},
  } = options

  const items = ref([])
  const page = ref(1)
  const pageSize = ref(initialPageSize)
  const total = ref(0)
  const totalPages = ref(1)
  const loading = ref(false)
  const error = ref('')
  const sort = ref(initialSort)
  const order = ref(initialOrder)
  const filters = reactive({ ...initialFilters })

  let requestSeq = 0
  let disposed = false
  let debounceTimer = null
  let controller = null

  onScopeDispose(() => {
    disposed = true
    if (debounceTimer) clearTimeout(debounceTimer)
    controller?.abort()
  })

  async function run() {
    if (disposed) return
    const seq = ++requestSeq
    controller?.abort()
    controller = new AbortController()

    loading.value = true
    error.value = ''
    try {
      const data = await fetcher({
        page: page.value,
        pageSize: pageSize.value,
        ...(sort.value ? { sort: sort.value } : {}),
        ...(order.value ? { order: order.value } : {}),
        ...cleanFilters(),
      })
      // 过期响应直接丢弃，否则快速切换筛选会看到旧数据闪回。
      if (seq !== requestSeq || disposed) return
      const normalized = normalizePage(data)

      // 服务端在页码越界且查询结果为空时取不到总数（COUNT(*) OVER() 没有行可依附），
      // 也就无从钳位，只能原样回传页码并把 total 报成 0。这里用上一次已知的
      // totalPages 兜住：把页码压回最后一页再查一次，用户不会停在空白页上。
      // 只可能朝更小的页码走，最多再查一轮，不会来回震荡。
      if (normalized.items.length === 0 && normalized.page > totalPages.value) {
        page.value = totalPages.value
        loading.value = false
        return run()
      }

      items.value = normalized.items
      total.value = normalized.total
      totalPages.value = normalized.totalPages
      page.value = normalized.page
      pageSize.value = normalized.pageSize
    } catch (err) {
      if (seq !== requestSeq || disposed) return
      if (err?.name === 'AbortError') return
      error.value = err?.message || '加载失败'
      items.value = []
      total.value = 0
      totalPages.value = 1
    } finally {
      if (seq === requestSeq) loading.value = false
    }
  }

  /** 空字符串代表"不筛选"，不能发给后端，否则会变成 title ILIKE '%%' 之外的语义差异。 */
  function cleanFilters() {
    const result = {}
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === '') continue
      result[key] = value
    }
    return result
  }

  function reload() {
    return run()
  }

  function setPage(next) {
    const target = Math.min(Math.max(1, Number(next) || 1), Math.max(1, totalPages.value))
    if (target === page.value) return
    page.value = target
    return run()
  }

  function setPageSize(next) {
    pageSize.value = Number(next) || initialPageSize
    page.value = 1
    return run()
  }

  function setSort(field) {
    if (sort.value === field) {
      order.value = order.value === 'asc' ? 'desc' : 'asc'
    } else {
      sort.value = field
      order.value = 'desc'
    }
    page.value = 1
    return run()
  }

  /**
   * 改筛选条件：防抖 300ms，并回到第 1 页（否则可能停在超出范围的页码上）。
   * 用 { flush: 'sync' } 让 immediate 调用（如点"重置"）跳过防抖立即查询。
   */
  function setFilter(key, value, { immediate: now = false } = {}) {
    filters[key] = value
    if (now) {
      if (debounceTimer) clearTimeout(debounceTimer)
      page.value = 1
      return run()
    }
    return undefined
  }

  function resetFilters() {
    for (const key of Object.keys(filters)) filters[key] = ''
    page.value = 1
    if (debounceTimer) clearTimeout(debounceTimer)
    return run()
  }

  // 筛选条件被 v-model 直接改写时自动查询。
  // 下游把 filters 透传给 vue 的 v-model 即可，不需要每个页面手动调 setFilter——
  // 也正因为如此，setFilter 只负责改值，触发统一走这里，避免一次改动查两遍。
  watch(
    filters,
    () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      page.value = 1
      debounceTimer = setTimeout(run, 300)
    },
    { deep: true }
  )

  if (immediate) run()

  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
    loading,
    error,
    filters,
    sort,
    order,
    // 去掉第一页/最后一页的边界判断，让模板里少写点东西
    isFirstPage: computed(() => page.value <= 1),
    isLastPage: computed(() => page.value >= totalPages.value),
    reload,
    setPage,
    setPageSize,
    setSort,
    setFilter,
    resetFilters,
  }
}
