/**
 * /api/doctors – Tìm kiếm, bản đồ, chi tiết, đề xuất; hồ sơ/trạng thái/vị trí của chính bác sĩ.
 *
 * GET  /                 tìm kiếm + lọc + sắp xếp + phân trang (đọc từ Doctor Directory trong RAM)
 * GET  /nearby           như trên, bắt buộc lat/lng (tìm trong bán kính)
 * GET  /recommended      Top 5 bác sĩ đề xuất (Multi-Criteria)
 * GET  /me               hồ sơ của bác sĩ đang đăng nhập
 * PATCH /me              cập nhật hồ sơ
 * PATCH /me/status       online/offline + sẵn sàng nhận bệnh
 * PATCH /me/location     chia sẻ vị trí
 * GET  /me/requests      yêu cầu đang chờ phản hồi
 * GET  /me/stats         thống kê cá nhân
 * GET  /:id              chi tiết + review gần đây + slot trống
 * GET  /:id/reviews      danh sách đánh giá (phân trang)
 * GET  /:id/slots        slot theo ngày
 */
const { z } = require('zod')
const { createRouter, finalize, ah, HttpError, pagination, paged } = require('../lib/http')
const { q, one } = require('../lib/db')
const { requireAuth, requireRole, optionalAuth } = require('../lib/auth')
const directory = require('../lib/directory')
const catalog = require('../lib/catalog')
const events = require('../lib/events')
const dispatch = require('../lib/dispatch')
const { scoreDoctor, normalizeWeights } = require('../lib/matching')
const { haversineKm, isValidCoord } = require('../lib/geo')
const { doctorPublic, doctorPrivate } = require('../lib/present')

const router = createRouter()

const searchSchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().positive().max(50).optional(),
  specialtyId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(80).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  minExperience: z.coerce.number().int().min(0).optional(),
  type: z.enum(['ONLINE', 'IN_PERSON']).optional(),
  availableOnly: z.enum(['true', 'false']).optional(),
  sort: z.enum(['nearest', 'rating', 'price', 'experience', 'recommended']).default('recommended'),
})

const fold = require('../lib/symptoms').normalize

async function search(query, { requireLocation = false } = {}) {
  const p = searchSchema.parse(query)
  const page = pagination(query, { defaultLimit: 20, maxLimit: 100 })
  const hasLoc = p.lat != null && p.lng != null && isValidCoord(p.lat, p.lng)
  if (requireLocation && !hasLoc) throw new HttpError(422, 'Cần tọa độ lat/lng', 'VALIDATION_ERROR')
  await directory.ensure()
  const specs = await catalog.specialties()
  const radius = p.radius || (hasLoc ? 10 : null)
  const related = p.specialtyId ? await catalog.relatedIds(p.specialtyId) : []
  const weights = normalizeWeights()
  const needle = fold(p.q)

  let list = []
  for (const d of directory.all()) {
    if (!d.verified || !d.isActive) continue
    if (p.specialtyId && !d.specialtyIds.includes(p.specialtyId)) continue
    if (needle && !fold(d.name).includes(needle) && !fold(d.clinicName).includes(needle)) continue
    if (p.minRating && d.rating < p.minRating) continue
    if (p.maxPrice && d.fee > p.maxPrice) continue
    if (p.minExperience && d.experienceYears < p.minExperience) continue
    if (p.type && !d.consultationTypes.includes(p.type)) continue
    const available = d.status === 'ONLINE' && d.availability === 'AVAILABLE'
    if (p.availableOnly === 'true' && !available) continue
    let distanceKm = null
    if (hasLoc) {
      distanceKm = haversineKm(p.lat, p.lng, d.lat, d.lng)
      if (radius && distanceKm > radius) continue
    }
    // Điểm đề xuất: cùng công thức Matching Score; bác sĩ offline có AvailabilityScore = 0
    const s = scoreDoctor({ ...d, load: d.load }, { lat: p.lat, lng: p.lng, specialtyId: p.specialtyId, relatedSpecialtyIds: related, radiusKm: radius || 10 }, weights, distanceKm ?? (radius || 10) / 2)
    const score = available ? s.score : s.score - weights.availability * s.components.availability
    list.push({ d, distanceKm, matchScore: Math.round(score * 1000) / 10 })
  }
  const sorters = {
    nearest: (a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9),
    rating: (a, b) => b.d.rating - a.d.rating || b.d.totalReviews - a.d.totalReviews,
    price: (a, b) => a.d.fee - b.d.fee,
    experience: (a, b) => b.d.experienceYears - a.d.experienceYears,
    recommended: (a, b) => b.matchScore - a.matchScore,
  }
  list.sort(sorters[p.sort])
  const total = list.length
  const items = list.slice(page.offset, page.offset + page.limit).map((x) => ({
    ...doctorPublic(x.d, specs, hasLoc ? { lat: p.lat, lng: p.lng } : null),
    matchScore: x.matchScore,
  }))
  return { ...paged(items, total, page), radiusKm: radius, onlineCount: list.filter((x) => x.d.status === 'ONLINE' && x.d.availability === 'AVAILABLE').length }
}

router.get('/', optionalAuth, ah(async (req, res) => res.json(await search(req.query))))
router.get('/nearby', optionalAuth, ah(async (req, res) => res.json(await search(req.query, { requireLocation: true }))))

/** Recommendation: Top 5 bác sĩ theo Multi-Criteria (không giới hạn trạng thái online để luôn có gợi ý) */
router.get('/recommended', optionalAuth, ah(async (req, res) => {
  const p = z.object({
    lat: z.coerce.number(), lng: z.coerce.number(), specialtyId: z.coerce.number().int().positive().optional(),
    type: z.enum(['ONLINE', 'IN_PERSON']).optional(), radius: z.coerce.number().positive().max(20).default(5),
  }).parse(req.query)
  const specs = await catalog.specialties()
  const result = await dispatch.findDoctors({ lat: p.lat, lng: p.lng, specialtyId: p.specialtyId, consultationType: p.type, radiusKm: p.radius, algorithm: 'multi', limit: 5 })
  res.json({
    radiusKm: result.radiusKm, eligible: result.eligibleCount, computeMs: result.elapsedMs, weights: result.weights,
    items: result.ranked.map((c) => ({ ...doctorPublic(directory.get(c.doctorId), specs, p), matchScore: c.score, components: c.components, rank: c.rank })),
  })
}))

// ───────────── Doctor self-service ─────────────
const doctorOnly = [requireAuth, requireRole('DOCTOR')]
const meDoctor = (req) => {
  const d = directory.get(req.user.doctorId)
  if (!d) throw new HttpError(404, 'Không tìm thấy hồ sơ bác sĩ')
  return d
}

router.get('/me', ...doctorOnly, ah(async (req, res) => {
  await directory.ensure()
  res.json(doctorPrivate(meDoctor(req), await catalog.specialties()))
}))

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().regex(/^0\d{9,10}$/, 'Số điện thoại không hợp lệ').optional(),
  avatar: z.string().url().max(500).optional().or(z.literal('')),
  education: z.string().trim().max(300).optional(),
  description: z.string().trim().max(1500).optional(),
  experienceYears: z.coerce.number().int().min(0).max(60).optional(),
  consultationFee: z.coerce.number().int().min(0).max(5_000_000).optional(),
  consultationTypes: z.array(z.enum(['ONLINE', 'IN_PERSON'])).min(1, 'Chọn ít nhất một hình thức khám').optional(),
  clinicId: z.coerce.number().int().positive().nullable().optional(),
  licenseNumber: z.string().trim().max(40).optional(),
  specialtyIds: z.array(z.coerce.number().int().positive()).min(1).max(3).optional(),
})

router.patch('/me', ...doctorOnly, ah(async (req, res) => {
  const b = profileSchema.parse(req.body)
  const d = meDoctor(req)
  const specIds = b.specialtyIds || null
  await q(
    `WITH u AS (UPDATE users SET full_name = COALESCE($2, full_name), phone = COALESCE($3, phone), avatar = COALESCE($4, avatar), updated_at = now() WHERE id = $1),
     d AS (UPDATE doctors SET education = COALESCE($6, education), description = COALESCE($7, description),
              experience_years = COALESCE($8, experience_years), consultation_fee = COALESCE($9, consultation_fee),
              consultation_types = COALESCE($10::jsonb, consultation_types), clinic_id = CASE WHEN $11::boolean THEN $12::int ELSE clinic_id END,
              license_number = COALESCE($13, license_number), specialty_id = COALESCE($14::int, specialty_id), updated_at = now()
           WHERE id = $5),
     del AS (DELETE FROM doctor_specialties WHERE doctor_id = $5 AND $15::text IS NOT NULL AND NOT (specialty_id::text = ANY(string_to_array($15::text, ','))))
     INSERT INTO doctor_specialties (doctor_id, specialty_id, is_primary)
     SELECT $5, x::int, x::int = $14::int FROM unnest(string_to_array(COALESCE($15::text, ''), ',')) x WHERE x <> ''
     ON CONFLICT (doctor_id, specialty_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
    [req.user.id, b.fullName ?? null, b.phone ?? null, b.avatar === '' ? null : b.avatar ?? null, d.id, b.education ?? null, b.description ?? null,
      b.experienceYears ?? null, b.consultationFee ?? null, b.consultationTypes ? JSON.stringify(b.consultationTypes) : null,
      b.clinicId !== undefined, b.clinicId ?? null, b.licenseNumber ?? null, specIds ? specIds[0] : null, specIds ? specIds.join(',') : null],
  )
  const fresh = await directory.reload(d.id)
  res.json(doctorPrivate(fresh, await catalog.specialties()))
}))

router.patch('/me/status', ...doctorOnly, ah(async (req, res) => {
  const b = z.object({ status: z.enum(['ONLINE', 'OFFLINE']).optional(), availability: z.enum(['AVAILABLE', 'UNAVAILABLE']).optional() }).parse(req.body)
  const d = meDoctor(req)
  if (b.status && d.status === 'BUSY' && b.status === 'OFFLINE') throw new HttpError(409, 'Bạn đang trong phiên khám, hãy kết thúc phiên trước khi offline')
  const status = b.status && d.status !== 'BUSY' ? b.status : d.status
  const availability = b.availability || (b.status === 'ONLINE' ? 'AVAILABLE' : b.status === 'OFFLINE' ? 'UNAVAILABLE' : d.availability)
  await q(`UPDATE doctors SET status = $2, availability = $3, updated_at = now() WHERE id = $1`, [d.id, status, availability])
  const was = d.status
  directory.patch(d.id, { status, availability })
  if (was !== status) events.emitToRole('PATIENT', status === 'OFFLINE' ? 'DOCTOR_OFFLINE' : 'DOCTOR_ONLINE', { doctorId: d.id })
  res.json({ status, availability, verificationStatus: d.verificationStatus, warning: d.verified ? null : 'Hồ sơ chưa được duyệt nên bạn chưa xuất hiện trong hệ thống matching.' })
}))

router.patch('/me/location', ...doctorOnly, ah(async (req, res) => {
  const b = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }).parse(req.body)
  const d = meDoctor(req)
  await q(`UPDATE doctors SET latitude = $2, longitude = $3, location_updated_at = now() WHERE id = $1`, [d.id, b.lat, b.lng])
  // Lịch sử vị trí lưu MongoDB (GeoJSON, chỉ mục 2dsphere)
  require('../lib/telemetry').doctorLocation(d.id, b.lat, b.lng, 'app')
  directory.patch(d.id, { lat: b.lat, lng: b.lng, locationUpdatedAt: new Date().toISOString() })
  events.emitToRole('PATIENT', 'DOCTOR_LOCATION_UPDATED', { doctorId: d.id, lat: b.lat, lng: b.lng })
  res.json({ ok: true, latitude: b.lat, longitude: b.lng })
}))

router.get('/me/requests', ...doctorOnly, ah(async (req, res) => {
  const rows = await q(
    `SELECT r.id AS offer_id, r.expires_at, r.offered_at, r.distance_km, r.score, b.id AS booking_id, b.code, b.type, b.consultation_type,
            b.symptoms, b.scheduled_at, b.address, s.name AS specialty, u.full_name AS patient_name
     FROM booking_requests r JOIN bookings b ON b.id = r.booking_id JOIN patients p ON p.id = b.patient_id JOIN users u ON u.id = p.user_id
     LEFT JOIN specialties s ON s.id = b.specialty_id
     WHERE r.doctor_id = $1 AND r.status = 'OFFERED' AND r.expires_at > now() ORDER BY r.expires_at`,
    [req.user.doctorId],
  )
  res.json(rows.map((r) => ({
    offerId: r.offer_id, bookingId: r.booking_id, code: r.code, type: r.type, consultationType: r.consultation_type, symptoms: r.symptoms,
    scheduledAt: r.scheduled_at, address: r.consultation_type === 'IN_PERSON' ? r.address : null, specialty: r.specialty,
    patientName: maskName(r.patient_name), distanceKm: r.distance_km, score: r.score, expiresAt: r.expires_at, offeredAt: r.offered_at,
    timeoutSec: dispatch.OFFER_TIMEOUT_SEC,
  })))
}))
const maskName = (n = '') => {
  const p = n.trim().split(/\s+/)
  return p.length < 3 ? n : `${p[0]} ${p.slice(1, -1).map((x) => x[0] + '.').join(' ')} ${p[p.length - 1]}`
}

router.get('/me/stats', ...doctorOnly, ah(async (req, res) => {
  const row = await one(
    `SELECT
       (SELECT json_object_agg(status, n) FROM (SELECT status, count(*)::int n FROM bookings WHERE doctor_id = $1 GROUP BY status) s) AS by_status,
       (SELECT json_build_object('offered', count(*)::int, 'accepted', count(*) FILTER (WHERE status = 'ACCEPTED')::int,
                                 'rejected', count(*) FILTER (WHERE status = 'REJECTED')::int, 'expired', count(*) FILTER (WHERE status = 'EXPIRED')::int,
                                 'avgResponseMs', avg(response_ms) FILTER (WHERE status IN ('ACCEPTED','REJECTED') AND booking_id IN (SELECT id FROM bookings WHERE type = 'ON_DEMAND'))::int)
          FROM booking_requests WHERE doctor_id = $1) AS offers,
       (SELECT COALESCE(sum(p.amount), 0)::bigint FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE b.doctor_id = $1 AND p.status = 'SUCCESS') AS revenue,
       (SELECT COALESCE(sum(p.amount), 0)::bigint FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE b.doctor_id = $1 AND p.status = 'SUCCESS' AND p.paid_at > date_trunc('month', now())) AS revenue_month,
       (SELECT json_agg(x ORDER BY x.day) FROM (
          SELECT to_char(d, 'YYYY-MM-DD') AS day,
                 (SELECT count(*)::int FROM bookings b WHERE b.doctor_id = $1 AND b.status = 'COMPLETED' AND (b.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d::date) AS completed
          FROM generate_series((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 13, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, interval '1 day') d) x) AS series,
       (SELECT json_object_agg(rating, n) FROM (SELECT rating, count(*)::int n FROM reviews WHERE doctor_id = $1 AND status = 'VISIBLE' GROUP BY rating) r) AS rating_dist,
       (SELECT json_agg(r ORDER BY r.created_at DESC) FROM (
          SELECT rv.id, rv.rating, rv.comment, rv.created_at, u.full_name AS patient_name FROM reviews rv JOIN patients p ON p.id = rv.patient_id JOIN users u ON u.id = p.user_id
          WHERE rv.doctor_id = $1 AND rv.status = 'VISIBLE' ORDER BY rv.created_at DESC LIMIT 8) r) AS reviews,
       (SELECT json_agg(t ORDER BY t.scheduled_at) FROM (
          SELECT b.id, b.code, b.status, b.type, b.consultation_type, COALESCE(b.scheduled_at, b.accepted_at) AS scheduled_at, b.symptoms, u.full_name AS patient_name
          FROM bookings b JOIN patients p ON p.id = b.patient_id JOIN users u ON u.id = p.user_id
          WHERE b.doctor_id = $1 AND b.status IN ('CONFIRMED','IN_PROGRESS')
            AND (b.type = 'ON_DEMAND' OR (b.scheduled_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1)
          ORDER BY COALESCE(b.scheduled_at, b.accepted_at) LIMIT 20) t) AS today`,
    [req.user.doctorId],
  )
  const d = meDoctor(req)
  const o = row.offers || {}
  res.json({
    byStatus: row.by_status || {}, offers: o, acceptanceRate: o.offered ? o.accepted / o.offered : null,
    revenue: Number(row.revenue), revenueMonth: Number(row.revenue_month), series: row.series || [], ratingDistribution: row.rating_dist || {},
    reviews: (row.reviews || []).map((r) => ({ ...r, patient_name: maskName(r.patient_name) })), today: row.today || [], rating: d.rating, totalReviews: d.totalReviews,
  })
}))

// ───────────── Public detail ─────────────
router.get('/:id', optionalAuth, ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  await directory.ensure()
  const d = directory.get(id)
  if (!d || (!d.verified && req.user?.role !== 'ADMIN' && req.user?.doctorId !== id)) throw new HttpError(404, 'Không tìm thấy bác sĩ')
  const from = req.query.lat ? { lat: Number(req.query.lat), lng: Number(req.query.lng) } : null
  const row = await one(
    `SELECT
       (SELECT json_agg(r) FROM (SELECT rv.id, rv.rating, rv.comment, rv.created_at, u.full_name AS patient_name
          FROM reviews rv JOIN patients p ON p.id = rv.patient_id JOIN users u ON u.id = p.user_id
          WHERE rv.doctor_id = $1 AND rv.status = 'VISIBLE' ORDER BY rv.created_at DESC LIMIT 5) r) AS reviews,
       (SELECT json_object_agg(rating, n) FROM (SELECT rating, count(*)::int n FROM reviews WHERE doctor_id = $1 AND status = 'VISIBLE' GROUP BY rating) x) AS rating_dist,
       (SELECT json_agg(s ORDER BY s.start_at) FROM (SELECT id, start_at, end_at FROM appointment_slots
          WHERE doctor_id = $1 AND status = 'AVAILABLE' AND start_at > now() + interval '15 minutes' AND start_at < now() + interval '7 days' ORDER BY start_at LIMIT 400) s) AS slots,
       (SELECT json_agg(s ORDER BY s.day_of_week, s.start_time) FROM (SELECT day_of_week, start_time, end_time FROM doctor_schedules WHERE doctor_id = $1 AND is_active) s) AS schedules,
       (SELECT count(*)::int FROM bookings WHERE doctor_id = $1 AND status = 'COMPLETED') AS completed`,
    [id],
  )
  res.json({
    ...doctorPublic(d, await catalog.specialties(), from),
    reviews: (row.reviews || []).map((r) => ({ ...r, patient_name: maskName(r.patient_name) })),
    ratingDistribution: row.rating_dist || {},
    slots: row.slots || [],
    schedules: row.schedules || [],
    completedConsultations: row.completed,
  })
}))

router.get('/:id/reviews', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const page = pagination(req.query, { defaultLimit: 10 })
  const rows = await q(
    `SELECT rv.id, rv.rating, rv.comment, rv.created_at, u.full_name AS patient_name, count(*) OVER()::int AS total
     FROM reviews rv JOIN patients p ON p.id = rv.patient_id JOIN users u ON u.id = p.user_id
     WHERE rv.doctor_id = $1 AND rv.status = 'VISIBLE' ORDER BY rv.created_at DESC LIMIT $2 OFFSET $3`,
    [id, page.limit, page.offset],
  )
  res.json(paged(rows.map(({ total, ...r }) => ({ ...r, patient_name: maskName(r.patient_name) })), rows[0]?.total || 0, page))
}))

router.get('/:id/slots', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date)
  const rows = await q(
    `SELECT id, start_at, end_at, status FROM appointment_slots
     WHERE doctor_id = $1 AND (start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $2::date ORDER BY start_at`,
    [id, date],
  )
  res.json(rows.map((s) => ({ ...s, status: new Date(s.start_at) <= new Date() ? 'BLOCKED' : s.status })))
}))

module.exports = finalize(router)
