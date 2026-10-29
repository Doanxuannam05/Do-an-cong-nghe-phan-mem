/**
 * Thông báo in-app – PostgreSQL (bảng notifications) + đẩy real-time qua SSE.
 * id (UUID) sinh ở ứng dụng → đẩy SSE ngay lập tức, ghi DB theo lô (lib/batch.js).
 */
const crypto = require('crypto')
const events = require('./events')
const batch = require('./batch')

/** @param items [{ userId, type, title, body, data }] */
function notifySync(items) {
  const list = (Array.isArray(items) ? items : [items]).filter((x) => x && x.userId)
  if (!list.length) return []
  const now = new Date().toISOString()
  const rows = list.map((n) => ({
    id: crypto.randomUUID(),
    user_id: Number(n.userId),
    type: n.type,
    title: n.title,
    body: n.body || null,
    data: n.data || null,
    read_at: null,
    created_at: n.createdAt ? new Date(n.createdAt).toISOString() : now,
  }))
  batch.enqueue('notifications', rows)
  for (const r of rows) events.emit(r.user_id, 'NOTIFICATION', r)
  return rows
}

const notify = async (items) => notifySync(items)

module.exports = { notify, notifySync }
