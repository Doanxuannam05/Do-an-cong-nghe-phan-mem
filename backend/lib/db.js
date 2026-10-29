/**
 * Lớp truy cập DB mỏng trên dbQuery của SDK.
 * - Luôn dùng tham số hóa ($1, $2 …) → chống SQL injection.
 * - Bộ giới hạn tốc độ (sliding window) + retry khi gặp HTTP 429 – DB proxy của môi trường
 *   prototype cho phép ~200 truy vấn/phút, nên mọi hot-path đều được thiết kế 1 truy vấn/thao tác.
 * - Ghi nhận thời gian truy vấn để phục vụ chỉ số "Database Query Time".
 */
let pool = null
try {
  const { Pool } = require('pg')
  const connStr = process.env.DATABASE_URL || 'postgresql://postgres:1045889@localhost:5432/medigo'
  pool = new Pool({ connectionString: connStr })
} catch {
  // pg not installed
}

let surfDbQuery = null
if (!pool) {
  try {
    surfDbQuery = require('@surf-ai/sdk/db').dbQuery
  } catch {}
}

const WINDOW_MS = 60_000
const BUDGET = 150 // chừa dư địa cho các lệnh nội bộ của SDK
const SLOW_MS = 2000
const stamps = []
const stats = { count: 0, totalMs: 0, maxMs: 0, throttledMs: 0, retries: 0, recent: [] }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function acquire() {
  for (;;) {
    const now = Date.now()
    while (stamps.length && now - stamps[0] > WINDOW_MS) stamps.shift()
    if (stamps.length < BUDGET) {
      stamps.push(now)
      return
    }
    const wait = WINDOW_MS - (now - stamps[0]) + 25
    stats.throttledMs += wait
    await sleep(wait)
  }
}

async function q(sql, params = []) {
  if (pool) {
    const t0 = Date.now()
    try {
      const res = await pool.query(sql, params)
      record(Date.now() - t0, sql)
      return res.rows || []
    } catch (err) {
      const e = new Error(err.message)
      e.sql = sql.replace(/\s+/g, ' ').slice(0, 160)
      throw e
    }
  }

  for (let attempt = 0; ; attempt++) {
    await acquire()
    const t0 = Date.now()
    try {
      const res = await surfDbQuery(sql, params)
      record(Date.now() - t0, sql)
      return res.rows || []
    } catch (err) {
      const msg = String(err.message || '')
      const retryable = /API error (429|502|503|504)|fetch failed|ECONNRESET/i.test(msg)
      if (retryable && attempt < 5) {
        stats.retries++
        await sleep(Math.min(15000, 1500 * 2 ** attempt))
        continue
      }
      // Rút gọn thông điệp lỗi Postgres từ proxy
      let detail = msg
      try {
        detail = JSON.parse(msg.slice(msg.indexOf('{'))).error.message.replace(/^query error: (pq: )?/, '')
      } catch {
        /* giữ nguyên */
      }
      const e = new Error(detail)
      e.sql = sql.replace(/\s+/g, ' ').slice(0, 160)
      throw e
    }
  }
}

function record(ms, sql) {
  stats.count++
  stats.totalMs += ms
  stats.maxMs = Math.max(stats.maxMs, ms)
  stats.recent.push(ms)
  if (stats.recent.length > 200) stats.recent.shift()
  if (ms > SLOW_MS) console.warn(`[db] slow query ${ms}ms: ${sql.replace(/\s+/g, ' ').slice(0, 120)}`)
}

async function one(sql, params) {
  const rows = await q(sql, params)
  return rows[0] || null
}

/** Chèn nhiều dòng bằng một truy vấn duy nhất qua jsonb_to_recordset. */
async function bulkInsert(table, columns, rows, { returning = 'id', onConflict = '' } = {}) {
  if (!rows.length) return []
  const colNames = Object.keys(columns)
  const defs = colNames.map((c) => `"${c}" ${columns[c]}`).join(', ')
  const list = colNames.map((c) => `"${c}"`).join(', ')
  const out = []
  const CHUNK = 3000
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const res = await q(
      `INSERT INTO ${table} (${list}) SELECT ${list} FROM jsonb_to_recordset($1::jsonb) AS x(${defs}) ${onConflict} ${returning ? `RETURNING ${returning}` : ''}`,
      [JSON.stringify(chunk)],
    )
    out.push(...res)
  }
  return out
}

function dbStats() {
  const now = Date.now()
  const r = stats.recent
  return {
    queries: stats.count,
    avgMs: stats.count ? Math.round(stats.totalMs / stats.count) : null,
    recentAvgMs: r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length) : null,
    maxMs: stats.maxMs,
    lastMinute: stamps.filter((t) => now - t < WINDOW_MS).length,
    budgetPerMinute: BUDGET,
    retries: stats.retries,
  }
}

module.exports = { q, one, bulkInsert, dbStats }
