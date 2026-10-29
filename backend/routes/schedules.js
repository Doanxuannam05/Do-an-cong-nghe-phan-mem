/**
 * /api/schedules – lịch làm việc theo tuần và slot khám của bác sĩ.
 * Slot: AVAILABLE | BOOKED | BLOCKED. Slot đã BOOKED không thể khóa/xóa.
 */
const { z } = require('zod')
const { createRouter, finalize, ah, HttpError } = require('../lib/http')
const { q, one } = require('../lib/db')
const { requireAuth, requireRole } = require('../lib/auth')
const { rebuildSlots } = require('../lib/slots')

const router = createRouter()
router.use(requireAuth, requireRole('DOCTOR'))

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ dạng HH:MM')
const itemSchema = z.object({ dayOfWeek: z.number().int().min(0).max(6), startTime: time, endTime: time, slotMinutes: z.number().int().refine((v) => [15, 20, 30, 45, 60].includes(v)).default(30) })
  .refine((x) => x.startTime < x.endTime, { message: 'Giờ bắt đầu phải trước giờ kết thúc' })

/** Kiểm tra không chồng lấn khung giờ trong cùng một ngày */
function validateNoOverlap(items) {
  for (let d = 0; d < 7; d++) {
    const list = items.filter((i) => i.dayOfWeek === d).sort((a, b) => a.startTime.localeCompare(b.startTime))
    for (let i = 1; i < list.length; i++) {
      if (list[i].startTime < list[i - 1].endTime) throw new HttpError(422, `Khung giờ bị chồng lấn vào ${['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][d]}`, 'VALIDATION_ERROR')
    }
  }
}

router.get('/me', ah(async (req, res) => {
  const rows = await q(`SELECT id, day_of_week, start_time, end_time, slot_minutes FROM doctor_schedules WHERE doctor_id = $1 AND is_active ORDER BY day_of_week, start_time`, [req.user.doctorId])
  res.json(rows.map((r) => ({ id: r.id, dayOfWeek: r.day_of_week, startTime: r.start_time, endTime: r.end_time, slotMinutes: r.slot_minutes })))
}))

/** Thay toàn bộ lịch tuần rồi sinh lại slot trống (slot đã đặt được giữ nguyên) */
router.put('/me', ah(async (req, res) => {
  const { items } = z.object({ items: z.array(itemSchema).max(28) }).parse(req.body)
  validateNoOverlap(items)
  await q(
    `WITH del AS (DELETE FROM doctor_schedules WHERE doctor_id = $1)
     INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes)
     SELECT $1, x.day_of_week, x.start_time, x.end_time, x.slot_minutes FROM jsonb_to_recordset($2::jsonb) AS x(day_of_week int, start_time text, end_time text, slot_minutes int)`,
    [req.user.doctorId, JSON.stringify(items.map((i) => ({ day_of_week: i.dayOfWeek, start_time: i.startTime, end_time: i.endTime, slot_minutes: i.slotMinutes })))],
  )
  const created = await rebuildSlots(req.user.doctorId)
  res.json({ ok: true, slotsCreated: created })
}))

router.get('/me/slots', ah(async (req, res) => {
  const days = Math.min(14, Math.max(1, parseInt(req.query.days, 10) || 7))
  const rows = await q(
    `SELECT s.id, s.start_at, s.end_at, s.status, b.id AS booking_id, b.code, b.status AS booking_status, b.consultation_type, u.full_name AS patient_name
     FROM appointment_slots s LEFT JOIN bookings b ON b.id = s.booking_id LEFT JOIN patients p ON p.id = b.patient_id LEFT JOIN users u ON u.id = p.user_id
     WHERE s.doctor_id = $1 AND s.start_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'
       AND s.start_at < now() + make_interval(days => $2::int) ORDER BY s.start_at`,
    [req.user.doctorId, days],
  )
  const now = Date.now()
  res.json(rows.map((r) => ({ ...r, is_past: new Date(r.start_at).getTime() <= now, status: r.status === 'AVAILABLE' && new Date(r.start_at).getTime() <= now ? 'BLOCKED' : r.status })))
}))

router.patch('/slots/:id', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const { status } = z.object({ status: z.enum(['AVAILABLE', 'BLOCKED']) }).parse(req.body)
  const r = await one(
    `UPDATE appointment_slots SET status = $3 WHERE id = $1 AND doctor_id = $2 AND status <> 'BOOKED' AND start_at > now() RETURNING id, status`,
    [id, req.user.doctorId, status],
  )
  if (!r) throw new HttpError(409, 'Không thể thay đổi slot đã được đặt hoặc đã qua')
  res.json(r)
}))

module.exports = finalize(router)
