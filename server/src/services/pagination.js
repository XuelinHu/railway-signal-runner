/**
 * 管理台所有列表接口共用的分页工具。
 *
 * 两个刻意的安全设计：
 * 1. page/pageSize 一律转为整数并钳位，绝不把用户输入拼进 SQL。
 * 2. 排序字段只能从白名单映射里取，用户传的字符串永远不直接成为列名。
 */

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const ALLOWED_PAGE_SIZES = [10, 20, 50, 100]

export function buildPageParams(query = {}, options = {}) {
  const defaultPageSize = options.defaultPageSize ?? DEFAULT_PAGE_SIZE
  const maxPageSize = options.maxPageSize ?? MAX_PAGE_SIZE

  const rawPage = Number.parseInt(query.page, 10)
  const rawPageSize = Number.parseInt(query.pageSize, 10)

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0
    ? Math.min(rawPageSize, maxPageSize)
    : defaultPageSize

  return {
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  }
}

/**
 * 解析排序参数。
 * @param {object} query 请求 query
 * @param {Record<string, string>} allowlist 形如 { createdAt: 'u.created_at' }
 * @param {{ column: string, direction: 'ASC'|'DESC' }} fallback
 */
export function resolveSort(query, allowlist, fallback) {
  const requested = typeof query.sort === 'string' ? query.sort : ''
  const column = Object.prototype.hasOwnProperty.call(allowlist, requested)
    ? allowlist[requested]
    : fallback.column

  const requestedOrder = String(query.order ?? '').toLowerCase()
  const direction = requestedOrder === 'asc' || requestedOrder === 'desc'
    ? requestedOrder.toUpperCase()
    : fallback.direction

  return { column, direction }
}

/**
 * 组装分页信封。
 * 依赖查询里的 `COUNT(*) OVER()::int AS total_count`——一次往返同时拿到数据和总数。
 * 注意 pg 会把 bigint 以字符串返回，所以 SQL 里必须显式 ::int。
 *
 * 页码钳位：请求的页码超出总页数时，返回的 `page` 会被改成最后一页，
 * 前端据此重查一次并把用户带回有内容的页面（否则在最后一页删记录会停在空白页）。
 *
 * 但有一个做不到的情况：结果为空时 `COUNT(*) OVER()` 没有行可依附，取不到总数。
 * 此时不能猜一个页码，额外再发一次 COUNT 查询又会在每次越界访问时多一次往返。
 * 取舍是：空结果时原样回传请求页码，并把 total 报为 0；由前端的 usePagedQuery
 * 用它已知的上一次 totalPages 做钳位。两边各守一段，见 composables/usePagedQuery.js。
 */
export function pageEnvelope(rows, { page, pageSize }) {
  const total = Number(rows[0]?.total_count ?? 0)
  const items = rows.map((row) => {
    const { total_count: _totalCount, ...rest } = row
    return rest
  })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const clampedPage = items.length === 0 ? page : Math.min(page, totalPages)

  return {
    items,
    page: clampedPage,
    pageSize,
    total,
    totalPages,
  }
}

export { ALLOWED_PAGE_SIZES }
