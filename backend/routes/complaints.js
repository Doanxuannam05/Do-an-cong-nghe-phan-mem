/** /api/complaints – người dùng báo cáo Doctor / Booking / Payment / Service */
const { z } = require('zod')
const { createRouter, finalize, ah, HttpError, rateLimit } = require('../lib/http')
const { q, one } = require('../lib/db')
const { requireAuth } = require('../lib/auth')
const { notifySync } = require('../lib/notify')

const router = createRouter()
router.use(requireAuth)

router.post('/', rateLimit({ key: 'complaint', max: 10 }), ah(async (req, res) => {
  const b = z.object({
    targetType: z.enum(['DOCTOR', 'BOOKING', 'PAYMENT', 'SERVICE']),
    bookingId: z.coerce.number().int().positive().optional(),
    title: z.string().trim().min(5, 'Tiêu đề tối thiểu 5 ký tự').max(120),
    description: z.string().trim().max(2000).optional(),
  }).parse(req.body)
  const row = await one(
    `WITH bk AS (SELECT b.id, b.doctor_id FROM bookings b JOIN patients p ON p.id = b.patient_id LEFT JOIN doctors d ON d.id = b.doctor_id
                 WHERE b.id = $2 AND (p.user_id = $1 OR d.user_id = $1)),
     c AS (INSERT INTO complaints (reporter_id, target_type, booking_id, doctor_id, title, description)
           SELECT $1, $3, (SELECT id FROM bk), (SELECT doctor_id FROM bk), $4, $5 WHERE $2::int IS NULL OR EXISTS (SELECT 1 FROM bk) RETURNING *)
     SELECT row_to_json(c) AS complaint, (SELECT json_agg(id) FROM users WHERE role = 'ADMIN' AND is_active) AS admins FROM c`,
    [req.user.id, b.bookingId ?? null, b.targetType, b.title, b.description || null],
  )
  if (!row) throw new HttpError(404, 'Không tìm thấy lịch khám liên quan')
  notifySync((row.admins || []).map((a) => ({ userId: a, type: 'NEW_COMPLAINT', title: 'Khiếu nại mới', body: b.title, data: { complaintId: row.complaint.id } })))
  res.status(201).json(row.complaint)
}))

router.get('/mine', ah(async (req, res) => {
  res.json(await q(`SELECT c.*, b.code AS booking_code FROM complaints c LEFT JOIN bookings b ON b.id = c.booking_id WHERE c.reporter_id = $1 ORDER BY c.created_at DESC`, [req.user.id]))
}))

module.exports = finalize(router)
