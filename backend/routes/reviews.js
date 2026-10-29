/**
 * /api/reviews – đánh giá sau khám.
 * Ràng buộc: Booking.status = COMPLETED, đúng người bệnh, mỗi booking 1 review (UNIQUE booking_id).
 * Cập nhật Average Rating + Total Reviews của bác sĩ trong cùng truy vấn → Matching Engine dùng ngay.
 */
const { z } = require('zod')
const { createRouter, finalize, ah, HttpError, pagination, paged } = require('../lib/http')
const { q, one } = require('../lib/db')
const { requireAuth, requireRole } = require('../lib/auth')
const directory = require('../lib/directory')
const { notify } = require('../lib/notify')

const router = createRouter()

router.post('/', requireAuth, requireRole('PATIENT'), ah(async (req, res) => {
  const b = z.object({ bookingId: z.coerce.number().int().positive(), rating: z.coerce.number().int().min(1, 'Chọn từ 1 đến 5 sao').max(5), comment: z.string().trim().max(1000).optional() }).parse(req.body)
  const row = await one(
    `WITH bk AS (SELECT id, doctor_id, status, patient_id FROM bookings WHERE id = $1),
     ok AS (SELECT * FROM bk WHERE status = 'COMPLETED' AND patient_id = $2 AND doctor_id IS NOT NULL),
     rv AS (INSERT INTO reviews (booking_id, patient_id, doctor_id, rating, comment) SELECT id, patient_id, doctor_id, $3, NULLIF($4, '') FROM ok
            ON CONFLICT (booking_id) DO NOTHING RETURNING *),
     agg AS (SELECT rv.doctor_id, (SELECT COALESCE(sum(rating), 0) FROM reviews WHERE doctor_id = rv.doctor_id AND status = 'VISIBLE') + rv.rating AS s,
                    (SELECT count(*) FROM reviews WHERE doctor_id = rv.doctor_id AND status = 'VISIBLE') + 1 AS n FROM rv),
     d AS (UPDATE doctors SET rating = round((agg.s::numeric / agg.n), 2)::real, total_reviews = agg.n FROM agg WHERE doctors.id = agg.doctor_id RETURNING doctors.id, doctors.rating, doctors.total_reviews, doctors.user_id)
     SELECT (SELECT row_to_json(rv) FROM rv) AS review, (SELECT row_to_json(bk) FROM bk) AS booking, (SELECT row_to_json(d) FROM d) AS doctor`,
    [b.bookingId, req.user.patientId, b.rating, b.comment || ''],
  )
  if (!row.booking || row.booking.patient_id !== req.user.patientId) throw new HttpError(404, 'Không tìm thấy lịch khám của bạn')
  if (row.booking.status !== 'COMPLETED') throw new HttpError(409, 'Chỉ đánh giá được sau khi buổi khám hoàn thành', 'NOT_COMPLETED')
  if (!row.review) throw new HttpError(409, 'Bạn đã đánh giá lịch khám này rồi', 'ALREADY_REVIEWED')
  if (row.doctor) {
    directory.patch(row.doctor.id, { rating: row.doctor.rating, totalReviews: row.doctor.total_reviews })
    notify({ userId: row.doctor.user_id, type: 'NEW_REVIEW', title: `Bạn nhận được đánh giá ${b.rating}★`, body: b.comment || null, data: { bookingId: b.bookingId } }).catch(() => {})
  }
  res.status(201).json({ review: row.review, doctorRating: row.doctor?.rating, totalReviews: row.doctor?.total_reviews })
}))

router.get('/doctor/:id', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const page = pagination(req.query, { defaultLimit: 10 })
  const rows = await q(
    `SELECT id, rating, comment, created_at, count(*) OVER()::int AS total FROM reviews WHERE doctor_id = $1 AND status = 'VISIBLE' ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [id, page.limit, page.offset],
  )
  res.json(paged(rows.map(({ total, ...r }) => r), rows[0]?.total || 0, page))
}))

module.exports = finalize(router)
