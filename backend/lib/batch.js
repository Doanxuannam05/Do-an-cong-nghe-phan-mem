/**
 * Ghi theo lô (write-behind) cho dữ liệu ghi nhiều: thông báo, nhật ký điều phối, lịch sử vị trí, số đo API.
 *
 * Vì sao: proxy PostgreSQL của môi trường prototype giới hạn ~200 truy vấn/phút. Thay vì 1 truy vấn / bản ghi,
 * các bản ghi được gom trong RAM rồi chèn bằng MỘT truy vấn (jsonb_to_recordset) mỗi vài giây.
 * Nếu DB tạm lỗi, bản ghi được giữ lại và thử lại ở lần sau → luồng khám / điều phối không bị ảnh hưởng.
 */
const TABLES = {
  notifications: {
    columns: { id: 'text', user_id: 'int', type: 'text', title: 'text', body: 'text', data: 'jsonb', read_at: 'timestamptz', created_at: 'timestamptz' },
    delayMs: 1000,
    onConflict: 'ON CONFLICT (id) DO NOTHING',
  },
  dispatch_events: {
    columns: { booking_id: 'int', event: 'text', doctor_id: 'int', rank: 'int', score: 'real', distance_km: 'real', response_ms: 'int', data: 'jsonb', at: 'timestamptz' },
    delayMs: 5000,
  },
  doctor_locations: {
    columns: { doctor_id: 'int', latitude: 'float8', longitude: 'float8', source: 'text', recorded_at: 'timestamptz' },
    delayMs: 5000,
  },
  api_metrics: {
    columns: { route: 'text', status: 'int', ms: 'int', role: 'text', at: 'timestamptz' },
    delayMs: 30000,
  },
}

const MAX_BUFFER = 5000
const buffers = new Map(Object.keys(TABLES).map((t) => [t, []]))
const timers = new Map()
const stats = { flushes: 0, rows: 0, failures: 0, lastError: null }

// Có thể thay writer trong unit test
let writer = (table, columns, rows, onConflict) => require('./db').bulkInsert(table, columns, rows, { returning: '', onConflict })
const setWriter = (fn) => (writer = fn)

function enqueue(table, rows) {
  const cfg = TABLES[table]
  if (!cfg) throw new Error(`Bảng không hỗ trợ ghi theo lô: ${table}`)
  const list = (Array.isArray(rows) ? rows : [rows]).map((r) => {
    const o = {}
    for (const c of Object.keys(cfg.columns)) o[c] = r[c] instanceof Date ? r[c].toISOString() : r[c] ?? null
    return o
  })
  const buf = buffers.get(table)
  buf.push(...list)
  if (buf.length > MAX_BUFFER) buf.splice(0, buf.length - MAX_BUFFER)
  schedule(table, cfg.delayMs)
}

function schedule(table, delay) {
  if (timers.has(table)) return
  const t = setTimeout(() => {
    timers.delete(table)
    flushTable(table).catch(() => {})
  }, delay)
  t.unref?.()
  timers.set(table, t)
}

async function flushTable(table) {
  const buf = buffers.get(table)
  if (!buf.length) return 0
  const batch = buf.splice(0, buf.length)
  const cfg = TABLES[table]
  try {
    await writer(table, cfg.columns, batch, cfg.onConflict || '')
    stats.flushes++
    stats.rows += batch.length
    return batch.length
  } catch (e) {
    stats.failures++
    stats.lastError = e.message
    // Lỗi dữ liệu (vi phạm ràng buộc, sai kiểu) sẽ không tự hết → bỏ lô để không lặp vô hạn
    if (/violates|invalid input|out of range|does not exist/i.test(e.message || '')) {
      console.warn(`[batch] bỏ ${batch.length} bản ghi ${table} do lỗi dữ liệu: ${e.message}`)
      return 0
    }
    buf.unshift(...batch) // lỗi tạm thời (mạng, 429) → thử lại sau
    console.warn(`[batch] ghi ${table} thất bại (${batch.length} bản ghi), sẽ thử lại: ${e.message}`)
    schedule(table, 10000)
    return 0
  }
}

async function flush() {
  let n = 0
  for (const t of Object.keys(TABLES)) {
    const timer = timers.get(t)
    if (timer) clearTimeout(timer)
    timers.delete(t)
    n += await flushTable(t)
  }
  return n
}

const pending = () => Object.fromEntries([...buffers].map(([t, b]) => [t, b.length]))

module.exports = { enqueue, flush, pending, stats, setWriter, TABLES }
