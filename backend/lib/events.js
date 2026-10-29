/**
 * Real-time hub (Server-Sent Events).
 *
 * Server → client: luồng SSE theo từng user (GET /api/stream?token=...).
 * Client → server: REST (POST). Cặp SSE + REST tương đương WebSocket hai chiều cho prototype
 * và đi qua được proxy HTTP thông thường.
 *
 * Event types (theo đề cương): NEW_BOOKING_REQUEST, BOOKING_ACCEPTED, BOOKING_REJECTED,
 * DOCTOR_LOCATION_UPDATED, BOOKING_STATUS_CHANGED, NEW_MESSAGE, DOCTOR_ONLINE, DOCTOR_OFFLINE,
 * PAYMENT_COMPLETED, + NOTIFICATION, TYPING, MESSAGE_READ, RTC_SIGNAL, OFFER_CANCELLED.
 */
const clients = new Map() // userId → Set<res>
const roleIndex = new Map() // userId → role
const latency = { samples: [], max: 200 }

function addClient(user, res) {
  if (!clients.has(user.id)) clients.set(user.id, new Set())
  clients.get(user.id).add(res)
  roleIndex.set(user.id, user.role)
  return () => {
    const set = clients.get(user.id)
    if (!set) return
    set.delete(res)
    if (!set.size) clients.delete(user.id)
  }
}

function write(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify({ ...data, _ts: Date.now() })}\n\n`)
    if (typeof res.flush === 'function') res.flush()
  } catch {
    /* kết nối đã đóng */
  }
}

/** Gửi sự kiện tới một hoặc nhiều user */
function emit(userIds, event, data = {}) {
  const ids = Array.isArray(userIds) ? userIds : [userIds]
  for (const id of ids) {
    const set = clients.get(Number(id))
    if (!set) continue
    for (const res of set) write(res, event, data)
  }
}

function emitToRole(role, event, data = {}) {
  for (const [id, r] of roleIndex) if (r === role && clients.has(id)) emit(id, event, data)
}

const isOnline = (userId) => clients.has(Number(userId))
const onlineCount = () => clients.size

function recordLatency(ms) {
  latency.samples.push(ms)
  if (latency.samples.length > latency.max) latency.samples.shift()
}
function latencyStats() {
  const s = latency.samples
  if (!s.length) return { samples: 0, avgMs: null }
  return { samples: s.length, avgMs: Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10, maxMs: Math.max(...s) }
}

module.exports = { addClient, emit, emitToRole, write, isOnline, onlineCount, recordLatency, latencyStats }
