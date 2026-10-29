/**
 * Phiên khám: CONFIRMED → IN_PROGRESS → COMPLETED (mỗi bước 1 truy vấn nguyên tử).
 * Bác sĩ chỉ ghi nhận kết quả (ghi chú, lời khuyên, hẹn tái khám) – hệ thống KHÔNG chẩn đoán.
 */
const { one } = require('./db')
const sm = require('./stateMachine')
const events = require('./events')
const directory = require('./directory')
const { pushNotification } = require('./dispatch')
const chat = require('./chat')
const { HttpError } = require('./http')

function explain(cur, doctorId, to) {
  if (!cur) throw new HttpError(404, 'Không tìm thấy lịch khám')
  if (cur.doctor_id !== doctorId) throw new HttpError(403, 'Đây không phải ca khám của bạn')
  sm.assertTransition(cur.status, to)
  throw new HttpError(409, 'Trạng thái đã thay đổi, vui lòng tải lại')
}

async function start(bookingId, doctorId, actorUserId) {
  const row = await one(
    `WITH cur AS (SELECT id, status, doctor_id FROM bookings WHERE id = $1),
     b AS (UPDATE bookings SET status = 'IN_PROGRESS', started_at = now(), updated_at = now()
           WHERE id = $1 AND doctor_id = $2 AND status = 'CONFIRMED' RETURNING *),
     c AS (INSERT INTO consultations (booking_id, mode) SELECT id, consultation_type FROM b ON CONFLICT (booking_id) DO NOTHING),
     d AS (UPDATE doctors SET status = 'BUSY', updated_at = now() WHERE id = $2 AND status = 'ONLINE' AND EXISTS (SELECT 1 FROM b) RETURNING id),
     l AS (INSERT INTO booking_status_logs (booking_id, from_status, to_status, actor_id, note) SELECT id, 'CONFIRMED', 'IN_PROGRESS', $3::int, 'Bác sĩ bắt đầu phiên khám' FROM b)
     SELECT (SELECT row_to_json(b) FROM b) AS booking, (SELECT row_to_json(cur) FROM cur) AS cur,
            (SELECT p.user_id FROM b JOIN patients p ON p.id = b.patient_id) AS patient_user_id, (SELECT count(*) FROM d)::int AS busy`,
    [bookingId, doctorId, actorUserId || null],
  )
  if (!row.booking) explain(row.cur, doctorId, 'IN_PROGRESS')
  if (row.busy) directory.patch(doctorId, { status: 'BUSY' })
  if (row.booking.type === 'SCHEDULED') directory.adjustLoad(doctorId, +1)
  chat.systemMessage(bookingId, 'Phiên khám đã bắt đầu.')
  broadcast(row.booking, { userId: row.patient_user_id, type: 'CONSULTATION_STARTED', title: 'Phiên khám đã bắt đầu', body: `Bác sĩ đã bắt đầu phiên khám ${row.booking.code}.`, data: { bookingId } }, doctorId)
  return row.booking
}

async function end(bookingId, doctorId, actorUserId, { notes, advice, followUp }) {
  const row = await one(
    `WITH cur AS (SELECT id, status, doctor_id FROM bookings WHERE id = $1),
     b AS (UPDATE bookings SET status = 'COMPLETED', completed_at = now(), updated_at = now()
           WHERE id = $1 AND doctor_id = $2 AND status = 'IN_PROGRESS' RETURNING *),
     c AS (UPDATE consultations SET ended_at = now() WHERE booking_id = $1 AND EXISTS (SELECT 1 FROM b)),
     mn AS (INSERT INTO medical_notes (booking_id, doctor_id, notes, advice, follow_up) SELECT id, $2, $4, $5, $6 FROM b
            ON CONFLICT (booking_id) DO UPDATE SET notes = EXCLUDED.notes, advice = EXCLUDED.advice, follow_up = EXCLUDED.follow_up),
     pay AS (INSERT INTO payments (booking_id, amount, method, status) SELECT id, COALESCE(fee, 0), 'CASH', 'PENDING' FROM b ON CONFLICT (booking_id) DO NOTHING),
     l AS (INSERT INTO booking_status_logs (booking_id, from_status, to_status, actor_id, note) SELECT id, 'IN_PROGRESS', 'COMPLETED', $3::int, 'Bác sĩ kết thúc phiên khám' FROM b),
     d AS (UPDATE doctors SET status = 'ONLINE', updated_at = now()
           WHERE id = $2 AND status = 'BUSY' AND EXISTS (SELECT 1 FROM b)
             AND NOT EXISTS (SELECT 1 FROM bookings WHERE doctor_id = $2 AND status = 'IN_PROGRESS' AND id <> $1) RETURNING id)
     SELECT (SELECT row_to_json(b) FROM b) AS booking, (SELECT row_to_json(cur) FROM cur) AS cur,
            (SELECT p.user_id FROM b JOIN patients p ON p.id = b.patient_id) AS patient_user_id, (SELECT count(*) FROM d)::int AS online`,
    [bookingId, doctorId, actorUserId || null, notes || null, advice || null, followUp || null],
  )
  if (!row.booking) explain(row.cur, doctorId, 'COMPLETED')
  if (row.online) directory.patch(doctorId, { status: 'ONLINE' })
  directory.adjustLoad(doctorId, -1)
  chat.systemMessage(bookingId, 'Phiên khám đã kết thúc. Bác sĩ đã gửi ghi chú cho bạn.')
  broadcast(row.booking, { userId: row.patient_user_id, type: 'CONSULTATION_COMPLETED', title: 'Phiên khám đã hoàn thành', body: `Hãy thanh toán và đánh giá bác sĩ cho lịch ${row.booking.code}.`, data: { bookingId } }, doctorId)
  events.emit(row.patient_user_id, 'CONSULTATION_COMPLETED', { bookingId })
  return row.booking
}

function broadcast(b, notification, doctorId) {
  const d = directory.get(doctorId)
  const users = [notification?.userId, d?.userId].filter(Boolean)
  events.emit(users, 'BOOKING_STATUS_CHANGED', { bookingId: b.id, code: b.code, status: b.status })
  pushNotification(notification)
}

module.exports = { start, end }
