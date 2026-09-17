/**
 * 分页/筛选参数 → query string。
 *
 * 只做序列化，不做校验：越界与非法值统一由服务端钳位，
 * 前端再复制一套规则只会两边不一致。
 */

export const PAGE_SIZES = [10, 20, 50, 100]

export const DEFAULT_PAGE_SIZE = 20

export function toQuery(params = {}) {
  const query = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    // false 是有意义的筛选值（如 published=false），不能被当成"空"丢掉。
    query[key] = value === true || value === false ? String(value) : value
  }
  return query
}

/** 把后端的 {items,page,pageSize,total,totalPages} 转成表格组件要的形状。 */
export function normalizePage(data) {
  return {
    items: data?.items ?? [],
    page: data?.page ?? 1,
    pageSize: data?.pageSize ?? DEFAULT_PAGE_SIZE,
    total: data?.total ?? 0,
    totalPages: data?.totalPages ?? 1,
  }
}
