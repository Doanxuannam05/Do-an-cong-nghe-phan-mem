/**
 * /api/admin – quản trị toàn hệ thống (chỉ ADMIN).
 * Dashboard, người dùng, duyệt bác sĩ, booking, thanh toán, đánh giá, khiếu nại, giám sát hệ thống.
 */
const { z } = require('zod')
const { createRouter, finalize, ah, HttpError, pagination, paged } = require('../lib/http')
const { q, one, dbStats } = require('../lib/db')
const { requireAuth, requireRole } = require('../lib/auth')
const directory = require('../lib/directory')
const catalog = require('../lib/catalog')
const events = require('../lib/events')
const dispatch = require('../lib/dispatch')
const { notify } = require('../lib/notify')
const { doctorPrivate } = require('../lib/present')
const batch = require('../lib/batch')

const router = createRouter()
router.use(requireAuth, requireRole('ADMIN'))

const TZ = `'Asia/Ho_Chi_Minh'`

router.get('/stats', ah(async (_req, res) => {
  const t0 = Date.now()
  const row = await one(
    `SELECT
      (SELECT count(*)::int FROM patients p JOIN users u ON u.id = p.user_id WHERE u.deleted_at IS NULL) AS total_patients,
      (SELECT count(*)::int FROM bookings) AS total_bookings,
      (SELECT json_object_agg(status, n) FROM (SELECT status, count(*)::int n FROM bookings GROUP BY status) s) AS by_status,
      (SELECT json_object_agg(type, n) FROM (SELECT type, count(*)::int n FROM bookings GROUP BY type) s) AS by_type,
      (SELECT COALESCE(sum(amount), 0)::bigint FROM payments WHERE status = 'SUCCESS') AS revenue,
      (SELECT COALESCE(sum(amount), 0)::bigint FROM payments WHERE status = 'SUCCESS' AND paid_at > now() - interval '30 days') AS revenue_30d,
      (SELECT round(avg(rating)::numeric, 2)::float FROM reviews WHERE status = 'VISIBLE') AS avg_rating,
      (SELECT count(*)::int FROM reviews) AS total_reviews,
      (SELECT count(*)::int FROM complaints WHERE status IN ('OPEN','PROCESSING')) AS open_complaints,
      (SELECT json_agg(x ORDER BY x.day) FROM (
         SELECT to_char(d, 'YYYY-MM-DD') AS day,
                count(b.id)::int AS total,
                count(b.id) FILTER (WHERE b.status = 'COMPLETED')::int AS completed,
                count(b.id) FILTER (WHERE b.status IN ('CANCELLED'))::int AS cancelled,
                count(b.id) FILTER (WHERE b.status IN ('NO_DOCTOR_FOUND','REJECTED','EXPIRED'))::int AS failed,
                count(b.id) FILTER (WHERE b.type = 'ON_DEMAND')::int AS on_demand
         FROM generate_series((now() AT TIME ZONE ${TZ})::date - 29, (now() AT TIME ZONE ${TZ})::date, interval '1 day') d
         LEFT JOIN bookings b ON (b.created_at AT TIME ZONE ${TZ})::date = d::date
         GROUP BY d) x) AS by_day,
      (SELECT json_agg(x ORDER BY x.month) FROM (
         SELECT to_char(m, 'YYYY-MM') AS month,
                (SELECT count(*)::int FROM users u WHERE u.role = 'PATIENT' AND date_trunc('month', u.created_at AT TIME ZONE ${TZ}) = m) AS patients,
                (SELECT count(*)::int FROM users u WHERE u.role = 'DOCTOR' AND date_trunc('month', u.created_at AT TIME ZONE ${TZ}) = m) AS doctors
         FROM generate_series(date_trunc('month', now() AT TIME ZONE ${TZ}) - interval '5 months', date_trunc('month', now() AT TIME ZONE ${TZ}), interval '1 month') m) x) AS users_by_month,
      (SELECT json_build_object(
         'avgMatchingMs', round(avg(matching_ms)::numeric, 2)::float,
         'avgTimeToAcceptSec', round(avg(EXTRACT(EPOCH FROM (accepted_at - created_at))) FILTER (WHERE accepted_at IS NOT NULL)::numeric, 1)::float,
         'avgDistanceKm', round(avg(distance_km) FILTER (WHERE doctor_id IS NOT NULL)::numeric, 2)::float,
         'onDemand', count(*)::int,
         'matched', count(*) FILTER (WHERE doctor_id IS NOT NULL)::int,
         'noDoctor', count(*) FILTER (WHERE status = 'NO_DOCTOR_FOUND')::int)
       FROM bookings WHERE type = 'ON_DEMAND') AS dispatch,
      (SELECT json_build_object(
         'offers', count(*)::int,
         'accepted', count(*) FILTER (WHERE r.status = 'ACCEPTED')::int,
         'rejected', count(*) FILTER (WHERE r.status = 'REJECTED')::int,
         'expired', count(*) FILTER (WHERE r.status = 'EXPIRED')::int,
         'avgResponseMs', avg(r.response_ms) FILTER (WHERE r.status IN ('ACCEPTED','REJECTED'))::int)
       FROM booking_requests r JOIN bookings b ON b.id = r.booking_id WHERE b.type = 'ON_DEMAND') AS offers,
      (SELECT json_agg(x ORDER BY x.n DESC) FROM (
         SELECT s.name, count(b.id)::int AS n, count(b.id) FILTER (WHERE b.status = 'COMPLETED')::int AS completed
         FROM specialties s LEFT JOIN bookings b ON b.specialty_id = s.id AND b.created_at > now() - interval '30 days' GROUP BY s.name) x) AS by_specialty,
      (SELECT json_agg(x) FROM (
         SELECT d.id, u.full_name, count(b.id)::int AS completed, round(d.rating::numeric, 2)::float AS rating
         FROM doctors d JOIN users u ON u.id = d.user_id JOIN bookings b ON b.doctor_id = d.id AND b.status = 'COMPLETED' AND b.completed_at > now() - interval '30 days'
         GROUP BY d.id, u.full_name ORDER BY count(b.id) DESC LIMIT 8) x) AS top_doctors,
      (SELECT json_agg(x) FROM (
         SELECT b.id, b.code, b.type, b.status, b.created_at, s.name AS specialty, pu.full_name AS patient_name, du.full_name AS doctor_name
         FROM bookings b JOIN patients p ON p.id = b.patient_id JOIN users pu ON pu.id = p.user_id LEFT JOIN doctors d ON d.id = b.doctor_id
         LEFT JOIN users du ON du.id = d.user_id LEFT JOIN specialties s ON s.id = b.specialty_id ORDER BY b.created_at DESC LIMIT 8) x) AS recent`,
  )
  await directory.ensure()
  const docs = directory.all()
  const approved = docs.filter((d) => d.verified)
  const bs = row.by_status || {}
  const finished = (bs.COMPLETED || 0) + (bs.CANCELLED || 0) + (bs.NO_DOCTOR_FOUND || 0) + (bs.REJECTED || 0) + (bs.EXPIRED || 0)
  res.json({
    totals: {
      patients: row.total_patients, doctors: approved.length, pendingDoctors: docs.filter((d) => d.verificationStatus === 'PENDING').length,
      onlineDoctors: approved.filter((d) => d.status !== 'OFFLINE').length, availableDoctors: approved.filter((d) => d.status === 'ONLINE' && d.availability === 'AVAILABLE').length,
      busyDoctors: approved.filter((d) => d.status === 'BUSY').length,
      bookings: row.total_bookings, completed: bs.COMPLETED || 0, cancelled: bs.CANCELLED || 0, active: ['SEARCHING', 'OFFERED', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'].reduce((s, k) => s + (bs[k] || 0), 0),
      revenue: Number(row.revenue), revenue30d: Number(row.revenue_30d), avgRating: row.avg_rating, totalReviews: row.total_reviews, openComplaints: row.open_complaints,
      successRate: finished ? (bs.COMPLETED || 0) / finished : null,
    },
    byStatus: bs, byType: row.by_type || {}, byDay: row.by_day || [], usersByMonth: row.users_by_month || [], bySpecialty: row.by_specialty || [],
    dispatch: { ...row.dispatch, ...row.offers, acceptanceRate: row.offers?.offers ? row.offers.accepted / row.offers.offers : null },
    doctorActivity: {
      online: approved.filter((d) => d.status === 'ONLINE').length, busy: approved.filter((d) => d.status === 'BUSY').length,
      offline: approved.filter((d) => d.status === 'OFFLINE').length, available: approved.filter((d) => d.status === 'ONLINE' && d.availability === 'AVAILABLE').length,
    },
    topDoctors: row.top_doctors || [], recent: row.recent || [],
    queryMs: Date.now() - t0,
  })
}))

/** Giám sát hệ thống: thời gian truy vấn DB, độ trễ real-time, kết nối đang mở */
router.get('/system', ah(async (_req, res) => {
  await batch.flush() // ghi nốt số đo đang chờ để thống kê đầy đủ
  const [storage, api] = await Promise.all([storageStats(), apiMetrics().catch((e) => ({ error: e.message }))])
  res.json({ storage, api, db: dbStats(), realtime: { connectedUsers: events.onlineCount(), ...events.latencyStats() }, dispatch: { activeContexts: dispatch.activeContexts(), timeoutSec: dispatch.OFFER_TIMEOUT_SEC }, directory: { doctors: directory.all().length }, uptimeSec: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1e6) })
}))

/** Số bản ghi các bảng dữ liệu ghi nhiều + hàng đợi ghi theo lô */
async function storageStats() {
  const row = await one(
    `SELECT (SELECT count(*)::int FROM conversations) AS conversations, (SELECT count(*)::int FROM messages) AS messages,
            (SELECT count(*)::int FROM notifications) AS notifications, (SELECT count(*)::int FROM doctor_locations) AS doctor_locations,
            (SELECT count(*)::int FROM dispatch_events) AS dispatch_events, (SELECT count(*)::int FROM experiment_runs) AS experiment_runs,
            (SELECT count(*)::int FROM api_metrics) AS api_metrics`,
  )
  return { tables: row, pending: batch.pending(), batch: { flushes: batch.stats.flushes, rows: batch.stats.rows, failures: batch.stats.failures, lastError: batch.stats.lastError } }
}

/** Thời gian phản hồi API 24 giờ qua (bảng api_metrics) – KPI "Average API Response Time" */
async function apiMetrics() {
  const row = await one(
    `WITH w AS (SELECT * FROM api_metrics WHERE at > now() - interval '24 hours')
     SELECT (SELECT count(*)::int FROM w) AS count,
            (SELECT round(avg(ms)::numeric, 1)::float FROM w) AS avg_ms,
            (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY ms)::float FROM w) AS p95_ms,
            (SELECT count(*)::int FROM w WHERE status >= 500) AS server_errors,
            (SELECT json_agg(x) FROM (
               SELECT route, count(*)::int AS count, round(avg(ms)::numeric, 1)::float AS avg_ms,
                      percentile_cont(0.95) WITHIN GROUP (ORDER BY ms)::float AS p95_ms, max(ms) AS max_ms
               FROM w GROUP BY route ORDER BY avg(ms) DESC LIMIT 12) x) AS slowest`,
  )
  return {
    windowHours: 24, count: row.count, avgMs: row.avg_ms, p95Ms: row.p95_ms == null ? null : Math.round(row.p95_ms * 10) / 10, serverErrors: row.server_errors,
    slowest: (row.slowest || []).map((r) => ({ route: r.route, count: r.count, avgMs: r.avg_ms, p95Ms: r.p95_ms == null ? null : Math.round(r.p95_ms * 10) / 10, maxMs: r.max_ms })),
  }
}

/** Lịch sử vị trí của bác sĩ */
router.get('/doctors/:id/locations', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const rows = await q(`SELECT latitude AS lat, longitude AS lng, source, recorded_at AS at FROM doctor_locations WHERE doctor_id = $1 ORDER BY recorded_at DESC LIMIT 100`, [id])
  res.json(rows)
}))

// ───────────── Users ─────────────
router.get('/users', ah(async (req, res) => {
  const p = z.object({ role: z.enum(['PATIENT', 'DOCTOR', 'ADMIN']).optional(), q: z.string().trim().max(80).optional() }).parse(req.query)
  const page = pagination(req.query)
  const rows = await q(
    `SELECT u.id, u.email, u.phone, u.full_name, u.role, u.is_active, u.created_at, u.last_login_at, p.id AS patient_id, d.id AS doctor_id,
            (SELECT count(*)::int FROM bookings b WHERE b.patient_id = p.id OR b.doctor_id = d.id) AS bookings, count(*) OVER()::int AS total
     FROM users u LEFT JOIN patients p ON p.user_id = u.id LEFT JOIN doctors d ON d.user_id = u.id
     WHERE u.deleted_at IS NULL AND ($1::text IS NULL OR u.role = $1) AND ($2::text IS NULL OR u.full_name ILIKE '%' || $2 || '%' OR u.email ILIKE '%' || $2 || '%')
     ORDER BY u.created_at DESC LIMIT $3 OFFSET $4`,
    [p.role || null, p.q || null, page.limit, page.offset],
  )
  res.json(paged(rows.map(({ total, ...r }) => r), rows[0]?.total || 0, page))
}))

router.patch('/users/:id', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body)
  if (id === req.user.id) throw new HttpError(400, 'Không thể khóa chính tài khoản đang đăng nhập')
  const r = await one(
    `WITH u AS (UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING id, is_active),
          t AS (UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND NOT $2 AND revoked_at IS NULL)
     SELECT u.*, (SELECT id FROM doctors WHERE user_id = $1) AS doctor_id FROM u`,
    [id, isActive],
  )
  if (!r) throw new HttpError(404, 'Không tìm thấy người dùng')
  if (r.doctor_id) directory.patch(r.doctor_id, { isActive })
  res.json(r)
}))

// ───────────── Doctors & verification ─────────────
router.get('/doctors', ah(async (req, res) => {
  const p = z.object({ verification: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(), q: z.string().trim().max(80).optional(), status: z.enum(['ONLINE', 'OFFLINE', 'BUSY']).optional() }).parse(req.query)
  const page = pagination(req.query)
  await directory.ensure()
  const specs = await catalog.specialties()
  const fold = require('../lib/symptoms').normalize
  const needle = p.q ? fold(p.q) : null
  const list = directory.all()
    .filter((d) => (!p.verification || d.verificationStatus === p.verification) && (!p.status || d.status === p.status) && (!needle || fold(d.name).includes(needle) || fold(d.email).includes(needle)))
    .sort((a, b) => (a.verificationStatus === 'PENDING' ? -1 : 0) - (b.verificationStatus === 'PENDING' ? -1 : 0) || new Date(b.createdAt) - new Date(a.createdAt))
  const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 }
  directory.all().forEach((d) => counts[d.verificationStatus]++)
  res.json({ ...paged(list.slice(page.offset, page.offset + page.limit).map((d) => doctorPrivate(d, specs)), list.length, page), counts })
}))

router.patch('/doctors/:id/verify', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const b = z.object({ status: z.enum(['APPROVED', 'REJECTED', 'PENDING']), note: z.string().trim().max(300).optional() }).parse(req.body)
  const r = await one(
    `WITH d AS (UPDATE doctors SET verification_status = $2, verification_note = $3,
                  status = CASE WHEN $2 = 'APPROVED' THEN status ELSE 'OFFLINE' END,
                  availability = CASE WHEN $2 = 'APPROVED' THEN availability ELSE 'UNAVAILABLE' END, updated_at = now()
                WHERE id = $1 RETURNING id, user_id, status, availability)
     SELECT * FROM d`,
    [id, b.status, b.note || null],
  )
  if (!r) throw new HttpError(404, 'Không tìm thấy bác sĩ')
  directory.patch(id, { verificationStatus: b.status, verificationNote: b.note || null, status: r.status, availability: r.availability })
  await notify({
    userId: r.user_id, type: 'VERIFICATION', data: { status: b.status },
    title: b.status === 'APPROVED' ? 'Hồ sơ đã được duyệt' : b.status === 'REJECTED' ? 'Hồ sơ bị từ chối' : 'Hồ sơ chuyển về chờ duyệt',
    body: b.status === 'APPROVED' ? 'Bạn có thể bật trạng thái sẵn sàng để nhận yêu cầu khám.' : b.note || null,
  })
  res.json({ id, verificationStatus: b.status })
}))

// ───────────── Bookings ─────────────
router.get('/bookings', ah(async (req, res) => {
  const p = z.object({ status: z.string().max(20).optional(), type: z.enum(['SCHEDULED', 'ON_DEMAND']).optional(), q: z.string().trim().max(40).optional() }).parse(req.query)
  const page = pagination(req.query)
  const rows = await q(
    `SELECT b.id, b.code, b.type, b.consultation_type, b.status, b.created_at, b.scheduled_at, b.fee, b.distance_km, b.matching_ms, b.algorithm,
            s.name AS specialty, pu.full_name AS patient_name, du.full_name AS doctor_name,
            (SELECT count(*)::int FROM booking_requests r WHERE r.booking_id = b.id) AS offers, count(*) OVER()::int AS total
     FROM bookings b JOIN patients p ON p.id = b.patient_id JOIN users pu ON pu.id = p.user_id LEFT JOIN doctors d ON d.id = b.doctor_id
     LEFT JOIN users du ON du.id = d.user_id LEFT JOIN specialties s ON s.id = b.specialty_id
     WHERE ($1::text IS NULL OR b.status = $1) AND ($2::text IS NULL OR b.type = $2) AND ($3::text IS NULL OR b.code ILIKE '%' || $3 || '%' OR pu.full_name ILIKE '%' || $3 || '%')
     ORDER BY b.created_at DESC LIMIT $4 OFFSET $5`,
    [p.status || null, p.type || null, p.q || null, page.limit, page.offset],
  )
  res.json(paged(rows.map(({ total, ...r }) => r), rows[0]?.total || 0, page))
}))

// ───────────── Payments ─────────────
router.get('/payments', ah(async (req, res) => {
  const p = z.object({ status: z.enum(['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED']).optional(), method: z.enum(['CASH', 'BANK_TRANSFER', 'MOCK_PAYMENT']).optional() }).parse(req.query)
  const page = pagination(req.query)
  const rows = await q(
    `SELECT py.*, b.code, pu.full_name AS patient_name, du.full_name AS doctor_name, count(*) OVER()::int AS total,
            sum(py.amount) FILTER (WHERE py.status = 'SUCCESS') OVER()::bigint AS total_success
     FROM payments py JOIN bookings b ON b.id = py.booking_id JOIN patients p ON p.id = b.patient_id JOIN users pu ON pu.id = p.user_id
     LEFT JOIN doctors d ON d.id = b.doctor_id LEFT JOIN users du ON du.id = d.user_id
     WHERE ($1::text IS NULL OR py.status = $1) AND ($2::text IS NULL OR py.method = $2) ORDER BY py.created_at DESC LIMIT $3 OFFSET $4`,
    [p.status || null, p.method || null, page.limit, page.offset],
  )
  res.json({ ...paged(rows.map(({ total, total_success, ...r }) => r), rows[0]?.total || 0, page), totalSuccess: Number(rows[0]?.total_success || 0) })
}))

// ───────────── Reviews ─────────────
router.get('/reviews', ah(async (req, res) => {
  const p = z.object({ status: z.enum(['VISIBLE', 'HIDDEN']).optional(), maxRating: z.coerce.number().int().min(1).max(5).optional() }).parse(req.query)
  const page = pagination(req.query)
  const rows = await q(
    `SELECT rv.*, b.code, pu.full_name AS patient_name, du.full_name AS doctor_name, count(*) OVER()::int AS total
     FROM reviews rv JOIN bookings b ON b.id = rv.booking_id JOIN patients p ON p.id = rv.patient_id JOIN users pu ON pu.id = p.user_id
     JOIN doctors d ON d.id = rv.doctor_id JOIN users du ON du.id = d.user_id
     WHERE ($1::text IS NULL OR rv.status = $1) AND ($2::int IS NULL OR rv.rating <= $2) ORDER BY rv.created_at DESC LIMIT $3 OFFSET $4`,
    [p.status || null, p.maxRating || null, page.limit, page.offset],
  )
  res.json(paged(rows.map(({ total, ...r }) => r), rows[0]?.total || 0, page))
}))

/** Ẩn/hiện review → tính lại rating của bác sĩ */
router.patch('/reviews/:id', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const { status } = z.object({ status: z.enum(['VISIBLE', 'HIDDEN']) }).parse(req.body)
  const r = await one(
    `WITH rv AS (UPDATE reviews SET status = $2 WHERE id = $1 RETURNING doctor_id),
     agg AS (SELECT rv.doctor_id,
               (SELECT COALESCE(sum(rating), 0) FROM reviews WHERE doctor_id = rv.doctor_id AND status = 'VISIBLE' AND id <> $1) + CASE WHEN $2 = 'VISIBLE' THEN (SELECT rating FROM reviews WHERE id = $1) ELSE 0 END AS s,
               (SELECT count(*) FROM reviews WHERE doctor_id = rv.doctor_id AND status = 'VISIBLE' AND id <> $1) + CASE WHEN $2 = 'VISIBLE' THEN 1 ELSE 0 END AS n FROM rv)
     UPDATE doctors SET rating = CASE WHEN agg.n = 0 THEN 0 ELSE round(agg.s::numeric / agg.n, 2)::real END, total_reviews = agg.n
     FROM agg WHERE doctors.id = agg.doctor_id RETURNING doctors.id, doctors.rating, doctors.total_reviews`,
    [id, status],
  )
  if (!r) throw new HttpError(404, 'Không tìm thấy đánh giá')
  directory.patch(r.id, { rating: r.rating, totalReviews: r.total_reviews })
  res.json({ id, status, doctorRating: r.rating })
}))

// ───────────── Complaints ─────────────
router.get('/complaints', ah(async (req, res) => {
  const p = z.object({ status: z.enum(['OPEN', 'PROCESSING', 'RESOLVED', 'REJECTED']).optional() }).parse(req.query)
  const rows = await q(
    `SELECT c.*, u.full_name AS reporter_name, u.role AS reporter_role, b.code AS booking_code, du.full_name AS doctor_name
     FROM complaints c JOIN users u ON u.id = c.reporter_id LEFT JOIN bookings b ON b.id = c.booking_id
     LEFT JOIN doctors d ON d.id = c.doctor_id LEFT JOIN users du ON du.id = d.user_id
     WHERE ($1::text IS NULL OR c.status = $1) ORDER BY CASE c.status WHEN 'OPEN' THEN 0 WHEN 'PROCESSING' THEN 1 ELSE 2 END, c.created_at DESC LIMIT 200`,
    [p.status || null],
  )
  res.json(rows)
}))

router.patch('/complaints/:id', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const b = z.object({ status: z.enum(['OPEN', 'PROCESSING', 'RESOLVED', 'REJECTED']), adminNote: z.string().trim().max(1000).optional() }).parse(req.body)
  const r = await one(
    `WITH c AS (UPDATE complaints SET status = $2, admin_note = COALESCE($3, admin_note), handled_by = $4, updated_at = now() WHERE id = $1 RETURNING *)
     SELECT (SELECT row_to_json(c) FROM c) AS complaint`,
    [id, b.status, b.adminNote ?? null, req.user.id],
  )
  if (!r.complaint) throw new HttpError(404, 'Không tìm thấy khiếu nại')
  const label = { OPEN: 'Mới', PROCESSING: 'Đang xử lý', RESOLVED: 'Đã giải quyết', REJECTED: 'Từ chối' }[b.status]
  await notify({ userId: r.complaint.reporter_id, type: 'COMPLAINT_UPDATED', title: `Khiếu nại đã được cập nhật: ${label}`, body: r.complaint.admin_note || r.complaint.title, data: { complaintId: id } })
  res.json(r.complaint)
}))

module.exports = finalize(router)
