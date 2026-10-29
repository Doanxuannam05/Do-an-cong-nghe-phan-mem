/**
 * /api/patients – hồ sơ người bệnh (chỉ chính chủ). Không lưu hồ sơ bệnh án điện tử trong MVP.
 */
const { z } = require('zod')
const { createRouter, finalize, ah, HttpError } = require('../lib/http')
const { one } = require('../lib/db')
const { requireAuth, requireRole } = require('../lib/auth')

const router = createRouter()
router.use(requireAuth, requireRole('PATIENT'))

const SELECT = `SELECT p.id, p.user_id, u.full_name, u.email, u.phone, u.avatar, p.date_of_birth, p.gender, p.address, p.latitude, p.longitude, p.created_at, p.updated_at,
  (SELECT count(*)::int FROM bookings b WHERE b.patient_id = p.id AND b.status = 'COMPLETED') AS completed_count
  FROM patients p JOIN users u ON u.id = p.user_id`

const present = (r) => ({
  id: r.id, userId: r.user_id, fullName: r.full_name, email: r.email, phone: r.phone, avatar: r.avatar,
  dateOfBirth: r.date_of_birth ? String(r.date_of_birth).slice(0, 10) : null, gender: r.gender, address: r.address,
  latitude: r.latitude, longitude: r.longitude, completedCount: r.completed_count, createdAt: r.created_at, updatedAt: r.updated_at,
})

router.get('/me', ah(async (req, res) => {
  const r = await one(`${SELECT} WHERE p.user_id = $1`, [req.user.id])
  if (!r) throw new HttpError(404, 'Không tìm thấy hồ sơ')
  res.json(present(r))
}))

const schema = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().regex(/^0\d{9,10}$/, 'Số điện thoại không hợp lệ').optional().or(z.literal('')),
  avatar: z.string().url().max(500).optional().or(z.literal('')),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày sinh không hợp lệ').optional().or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  address: z.string().trim().max(200).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
})

router.patch('/me', ah(async (req, res) => {
  const b = schema.parse(req.body)
  const r = await one(
    `WITH u AS (UPDATE users SET full_name = COALESCE($2, full_name), phone = CASE WHEN $3::text IS NULL THEN phone ELSE NULLIF($3, '') END,
                  avatar = CASE WHEN $4::text IS NULL THEN avatar ELSE NULLIF($4, '') END, updated_at = now() WHERE id = $1),
     p AS (UPDATE patients SET date_of_birth = CASE WHEN $5::text IS NULL THEN date_of_birth ELSE NULLIF($5, '')::date END,
                  gender = COALESCE($6, gender), address = COALESCE($7, address), latitude = COALESCE($8, latitude), longitude = COALESCE($9, longitude), updated_at = now()
           WHERE user_id = $1 RETURNING id)
     SELECT id FROM p`,
    [req.user.id, b.fullName ?? null, b.phone ?? null, b.avatar ?? null, b.dateOfBirth ?? null, b.gender ?? null, b.address ?? null, b.latitude ?? null, b.longitude ?? null],
  )
  if (!r) throw new HttpError(404, 'Không tìm thấy hồ sơ')
  res.json(present(await one(`${SELECT} WHERE p.user_id = $1`, [req.user.id])))
}))

/** Lưu vị trí GPS hiện tại */
router.patch('/me/location', ah(async (req, res) => {
  const b = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180), address: z.string().trim().max(200).optional() }).parse(req.body)
  await one(`UPDATE patients SET latitude = $2, longitude = $3, address = COALESCE($4, address), updated_at = now() WHERE user_id = $1 RETURNING id`, [req.user.id, b.lat, b.lng, b.address ?? null])
  res.json({ ok: true, latitude: b.lat, longitude: b.lng })
}))

module.exports = finalize(router)
