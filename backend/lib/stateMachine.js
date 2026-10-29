/**
 * State machine của Booking.
 *
 *   PENDING ──► SEARCHING ──► OFFERED ──► ACCEPTED ──► CONFIRMED ──► IN_PROGRESS ──► COMPLETED
 *      │            │  ▲          │                        │
 *      │            │  └──────────┤ (bác sĩ từ chối / hết 30s → tìm bác sĩ kế tiếp)
 *      │            ▼             ▼
 *      │      NO_DOCTOR_FOUND   REJECTED / EXPIRED (đặt lịch: bác sĩ từ chối / quá hạn xác nhận)
 *      └──────────► CANCELLED ◄── (từ PENDING, SEARCHING, OFFERED, ACCEPTED, CONFIRMED)
 *
 * Mọi chuyển trạng thái khác đều bị từ chối (ví dụ COMPLETED → ACCEPTED).
 * Kiểm tra 2 lớp: (1) tại ứng dụng để báo lỗi rõ ràng, (2) tại DB bằng điều kiện
 * WHERE status IN (...) trong cùng câu UPDATE để chống race condition.
 */
const { one } = require('./db')
const { HttpError } = require('./http')

const TRANSITIONS = Object.freeze({
  PENDING: ['SEARCHING', 'OFFERED', 'CANCELLED'],
  SEARCHING: ['OFFERED', 'NO_DOCTOR_FOUND', 'CANCELLED'],
  OFFERED: ['ACCEPTED', 'SEARCHING', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  ACCEPTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
  EXPIRED: [],
  NO_DOCTOR_FOUND: [],
})
const STATUSES = Object.keys(TRANSITIONS)
const TERMINAL = STATUSES.filter((s) => TRANSITIONS[s].length === 0)
const ACTIVE = ['PENDING', 'SEARCHING', 'OFFERED', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS']

const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to)
const allowedFrom = (to) => STATUSES.filter((s) => TRANSITIONS[s].includes(to))

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new HttpError(409, `Không thể chuyển trạng thái từ ${from} sang ${to}`, 'INVALID_TRANSITION')
  }
}

const TIMESTAMP_COL = { ACCEPTED: 'accepted_at', IN_PROGRESS: 'started_at', COMPLETED: 'completed_at', CANCELLED: 'cancelled_at' }

/**
 * Chuyển trạng thái nguyên tử + ghi log trong một truy vấn.
 * @param extra  các cột cần cập nhật thêm, ví dụ { doctor_id: 5 }
 * @returns booking sau cập nhật, hoặc null nếu trạng thái hiện tại không cho phép (đã bị đổi bởi tiến trình khác)
 */
async function transition(bookingId, to, { actorId = null, note = null, extra = {}, expectFrom } = {}) {
  const from = (expectFrom || allowedFrom(to)).filter((s) => canTransition(s, to))
  if (!from.length) throw new HttpError(409, `Trạng thái ${to} không hợp lệ`, 'INVALID_TRANSITION')
  const sets = ['status = $2', 'updated_at = now()']
  const params = [bookingId, to, from.join(','), actorId, note]
  if (TIMESTAMP_COL[to]) sets.push(`${TIMESTAMP_COL[to]} = now()`)
  for (const [col, val] of Object.entries(extra)) {
    if (!/^[a-z_]+$/.test(col)) throw new Error('invalid column')
    params.push(val && typeof val === 'object' ? JSON.stringify(val) : val)
    sets.push(`${col} = $${params.length}`)
  }
  return one(
    `WITH old AS (SELECT id, status FROM bookings WHERE id = $1 FOR UPDATE),
     upd AS (
       UPDATE bookings b SET ${sets.join(', ')}
       FROM old WHERE b.id = old.id AND old.status = ANY(string_to_array($3, ','))
       RETURNING b.*, old.status AS previous_status),
     log AS (
       INSERT INTO booking_status_logs (booking_id, from_status, to_status, actor_id, note)
       SELECT id, previous_status, $2, $4, $5 FROM upd RETURNING id)
     SELECT * FROM upd`,
    params,
  )
}

module.exports = { TRANSITIONS, STATUSES, TERMINAL, ACTIVE, canTransition, allowedFrom, assertTransition, transition }
