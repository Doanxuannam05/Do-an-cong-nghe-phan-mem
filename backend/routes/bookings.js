/**
 * /api/bookings – Đặt lịch (Scheduled), Khám ngay (On-demand), theo dõi, hủy, bác sĩ nhận/từ chối.
 *
 * POST  /                  đặt lịch theo slot (chống double booking)
 * POST  /on-demand         gửi yêu cầu khám ngay → Matching + Dispatch
 * GET   /preview           xem trước kết quả matching (không gửi yêu cầu)
 * GET   /                  danh sách lịch của tôi (patient/doctor), phân trang
 * GET   /:id               chi tiết + timeline trạng thái + lịch sử dispatch
 * PATCH /:id/cancel        hủy
 * POST  /:id/accept        bác sĩ chấp nhận
 * POST  /:id/reject        bác sĩ từ chối
 */
const { z } = require('zod')
const { createRouter, finalize, ah, HttpError, pagination, paged, rateLimit } = require('../lib/http')
const { q, one } = require('../lib/db')
const { requireAuth, requireRole } = require('../lib/auth')
const dispatch = require('../lib/dispatch')
const directory = require('../lib/directory')
const catalog = require('../lib/catalog')
const { ALGORITHMS } = require('../lib/matching')
const { doctorPublic } = require('../lib/present')


const router = createRouter()
router.use(requireAuth)

const ctype = z.enum(['ONLINE', 'IN_PERSON'])
const weightsSchema = z.object({ distance: z.number(), specialty: z.number(), availability: z.number(), rating: z.number(), experience: z.number() }).partial().optional()

router.post('/', requireRole('PATIENT'), rateLimit({ key: 'book', max: 30 }), ah(async (req, res) => {
  const b = z.object({ doctorId: z.coerce.number().int().positive(), slotId: z.coerce.number().int().positive(), consultationType: ctype, symptoms: z.string().trim().max(500).optional() }).parse(req.body)
  res.status(201).json(await dispatch.createScheduled(req.user, b))
}))

const onDemandSchema = z.object({
  specialtyId: z.coerce.number().int().positive(),
  consultationType: ctype,
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  address: z.string().trim().max(200).optional(),
  symptoms: z.string().trim().max(500).optional(),
  radiusKm: z.coerce.number().refine((v) => [1, 3, 5, 10].includes(v), 'Bán kính 1, 3, 5 hoặc 10 km').default(5),
  algorithm: z.enum(ALGORITHMS).default('multi'),
  weights: weightsSchema,
})

router.post('/on-demand', requireRole('PATIENT'), rateLimit({ key: 'ondemand', max: 20 }), ah(async (req, res) => {
  res.status(201).json(await dispatch.createOnDemand(req.user, onDemandSchema.parse(req.body)))
}))

router.get('/preview', ah(async (req, res) => {
  const p = z.object({
    specialtyId: z.coerce.number().int().positive().optional(), consultationType: ctype.optional(),
    lat: z.coerce.number(), lng: z.coerce.number(), radiusKm: z.coerce.number().positive().max(20).default(5), algorithm: z.enum(ALGORITHMS).default('multi'),
  }).parse(req.query)
  const r = await dispatch.findDoctors({ ...p, limit: 5 })
  const specs = await catalog.specialties()
  res.json({ ...r, ranked: r.ranked.map((c) => ({ ...c, doctor: doctorPublic(directory.get(c.doctorId), specs, p) })) })
}))

const SCOPES = {
  active: `b.status IN ('PENDING','SEARCHING','OFFERED','ACCEPTED','CONFIRMED','IN_PROGRESS')`,
  upcoming: `b.status IN ('OFFERED','ACCEPTED','CONFIRMED') AND b.type = 'SCHEDULED'`,
  history: `b.status IN ('COMPLETED','CANCELLED','REJECTED','EXPIRED','NO_DOCTOR_FOUND')`,
  all: 'TRUE',
}

router.get('/', ah(async (req, res) => {
  const { scope, type } = z.object({ scope: z.enum(Object.keys(SCOPES)).default('all'), type: z.enum(['SCHEDULED', 'ON_DEMAND']).optional() }).parse(req.query)
  const page = pagination(req.query)
  const owner = req.user.role === 'PATIENT' ? 'b.patient_id = $1' : req.user.role === 'DOCTOR' ? 'b.doctor_id = $1' : 'TRUE'
  const ownerId = req.user.role === 'PATIENT' ? req.user.patientId : req.user.doctorId || 0
  const rows = await q(
    `SELECT b.id, b.code, b.type, b.consultation_type, b.status, b.scheduled_at, b.created_at, b.updated_at, b.fee, b.distance_km, b.symptoms, b.doctor_id,
            s.name AS specialty_name, pu.full_name AS patient_name,
            (SELECT status FROM payments WHERE booking_id = b.id) AS payment_status,
            EXISTS (SELECT 1 FROM reviews WHERE booking_id = b.id) AS reviewed,
            count(*) OVER()::int AS total
     FROM bookings b JOIN patients p ON p.id = b.patient_id JOIN users pu ON pu.id = p.user_id LEFT JOIN specialties s ON s.id = b.specialty_id
     WHERE ${owner} AND ${SCOPES[scope]} AND ($2::text IS NULL OR b.type = $2)
     ORDER BY CASE WHEN b.status IN ('SEARCHING','OFFERED','IN_PROGRESS') THEN 0 ELSE 1 END, COALESCE(b.scheduled_at, b.created_at) DESC
     LIMIT $3 OFFSET $4`,
    [ownerId, type || null, page.limit, page.offset],
  )
  await directory.ensure()
  const specs = await catalog.specialties()
  res.json(paged(rows.map(({ total, ...r }) => ({
    ...r,
    doctor: r.doctor_id ? pick(doctorPublic(directory.get(r.doctor_id), specs)) : null,
    // Bác sĩ chỉ thấy họ tên đầy đủ khi đã nhận ca
    patient_name: req.user.role === 'PATIENT' ? undefined
      : req.user.role === 'DOCTOR' && ['PENDING', 'SEARCHING', 'OFFERED', 'REJECTED', 'EXPIRED', 'NO_DOCTOR_FOUND'].includes(r.status) ? maskName(r.patient_name) : r.patient_name,
  })), rows[0]?.total || 0, page))
}))
const pick = (d) => d && { id: d.id, userId: d.userId, fullName: d.fullName, avatar: d.avatar, specialty: d.specialty, rating: d.rating, clinic: d.clinic, consultationFee: d.consultationFee, isSimulated: d.isSimulated }

router.get('/:id', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const b = await one(
    `SELECT b.*, s.name AS specialty_name, pu.id AS patient_user_id, pu.full_name AS patient_name, pu.phone AS patient_phone,
            p.gender AS patient_gender, p.date_of_birth AS patient_dob,
            (SELECT json_agg(l ORDER BY l.created_at, l.id) FROM (SELECT id, from_status, to_status, note, created_at FROM booking_status_logs WHERE booking_id = b.id) l) AS timeline,
            (SELECT json_agg(r ORDER BY r.offered_at, r.id) FROM (SELECT id, doctor_id, rank, score, distance_km, status, offered_at, expires_at, responded_at, response_ms, reason FROM booking_requests WHERE booking_id = b.id) r) AS offers,
            (SELECT row_to_json(n) FROM (SELECT notes, advice, follow_up, created_at FROM medical_notes WHERE booking_id = b.id) n) AS notes,
            (SELECT row_to_json(x) FROM (SELECT id, amount, method, status, transaction_ref, paid_at FROM payments WHERE booking_id = b.id) x) AS payment,
            (SELECT row_to_json(x) FROM (SELECT id, rating, comment, created_at FROM reviews WHERE booking_id = b.id) x) AS review,
            (SELECT row_to_json(x) FROM (SELECT started_at, ended_at FROM consultations WHERE booking_id = b.id) x) AS consultation,
            (SELECT id FROM conversations WHERE id = b.id) AS conversation_id,
            (SELECT json_agg(e ORDER BY e.at, e.id) FROM (SELECT id, event, doctor_id, rank, score, distance_km, response_ms, data, at FROM dispatch_events WHERE booking_id = b.id ORDER BY at LIMIT 50) e) AS dispatch_events
     FROM bookings b JOIN patients p ON p.id = b.patient_id JOIN users pu ON pu.id = p.user_id LEFT JOIN specialties s ON s.id = b.specialty_id
     WHERE b.id = $1`,
    [id],
  )
  if (!b) throw new HttpError(404, 'Không tìm thấy lịch khám')

  // Phân quyền xem: người bệnh chủ lịch, bác sĩ được giao, bác sĩ đang được mời, admin
  const u = req.user
  const isPatient = u.role === 'PATIENT' && b.patient_user_id === u.id
  // Bác sĩ chỉ được coi là "phụ trách" (xem đầy đủ thông tin người bệnh) sau khi đã nhận ca
  const isAssigned = u.role === 'DOCTOR' && b.doctor_id === u.doctorId && !['PENDING', 'SEARCHING', 'OFFERED', 'REJECTED', 'EXPIRED', 'NO_DOCTOR_FOUND'].includes(b.status)
  const isOffered = u.role === 'DOCTOR' && (b.offers || []).some((o) => o.doctor_id === u.doctorId)
  const isAdmin = u.role === 'ADMIN'
  if (!isPatient && !isAssigned && !isOffered && !isAdmin && !(u.role === 'DOCTOR' && b.doctor_id === u.doctorId)) throw new HttpError(403, 'Bạn không có quyền xem lịch khám này')

  const seeAll = isPatient || isAdmin
  // Nhật ký điều phối (dispatch_events) – chỉ người bệnh chủ lịch và admin xem; ghép tên bác sĩ từ directory
  const dispatchEvents = seeAll ? (b.dispatch_events || []).map((e) => ({
    event: e.event, at: e.at, doctorId: e.doctor_id, doctorName: e.data?.doctorName || directory.get(e.doctor_id)?.name, rank: e.rank, score: e.score,
    distanceKm: e.distance_km, responseMs: e.response_ms, reason: e.data?.reason, triedDoctors: e.data?.triedDoctors,
  })) : []
  await directory.ensure()
  const specs = await catalog.specialties()
  const offers = (b.offers || [])
    .filter((o) => seeAll || o.doctor_id === u.doctorId)
    .map((o) => ({ ...o, doctor_name: directory.get(o.doctor_id)?.name }))
  const fullPatient = isPatient || isAssigned || isAdmin
  const age = b.patient_dob ? Math.floor((Date.now() - new Date(b.patient_dob).getTime()) / (365.25 * 86400000)) : null

  res.json({
    id: b.id, code: b.code, type: b.type, consultationType: b.consultation_type, status: b.status, specialtyId: b.specialty_id, specialtyName: b.specialty_name,
    scheduledAt: b.scheduled_at, createdAt: b.created_at, updatedAt: b.updated_at, acceptedAt: b.accepted_at, startedAt: b.started_at, completedAt: b.completed_at, cancelledAt: b.cancelled_at,
    symptoms: b.symptoms, address: fullPatient || b.consultation_type === 'IN_PERSON' ? b.address : null, cancelReason: b.cancel_reason,
    patientLocation: fullPatient || b.consultation_type === 'IN_PERSON' ? { lat: b.patient_lat, lng: b.patient_lng } : null,
    fee: b.fee, distanceKm: b.distance_km, algorithm: b.algorithm, searchRadiusKm: b.search_radius_km, matchingMs: b.matching_ms,
    candidates: seeAll ? b.candidates : null,
    patient: {
      fullName: fullPatient ? b.patient_name : maskName(b.patient_name),
      phone: isAssigned || isAdmin ? b.patient_phone : null,
      gender: fullPatient ? b.patient_gender : null, age: fullPatient ? age : null,
    },
    doctor: b.doctor_id ? doctorPublic(directory.get(b.doctor_id), specs, { lat: b.patient_lat, lng: b.patient_lng }) : null,
    timeline: b.timeline || [], offers, notes: isPatient || isAssigned || isAdmin ? b.notes : null,
    payment: b.payment, review: b.review, consultation: b.consultation, conversationId: isPatient || isAssigned ? b.conversation_id : null,
    dispatchEvents,
    myOffer: isOffered ? offers.find((o) => o.doctor_id === u.doctorId && o.status === 'OFFERED') || null : null,
    permissions: {
      canCancel: (isPatient || isAssigned || isAdmin) && ['PENDING', 'SEARCHING', 'OFFERED', 'ACCEPTED', 'CONFIRMED'].includes(b.status),
      canVideo: (isPatient || isAssigned) && ['CONFIRMED', 'IN_PROGRESS'].includes(b.status) && b.consultation_type === 'ONLINE',
      canChat: (isPatient || isAssigned) && !!b.conversation_id,
      canStart: isAssigned && b.status === 'CONFIRMED',
      canComplete: isAssigned && b.status === 'IN_PROGRESS',
      canPay: isPatient && ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(b.status) && (!b.payment || ['PENDING', 'FAILED'].includes(b.payment.status)),
      canReview: isPatient && b.status === 'COMPLETED' && !b.review,
      canRespond: isOffered && offers.some((o) => o.doctor_id === u.doctorId && o.status === 'OFFERED' && new Date(o.expires_at) > new Date()),
    },
  })
}))
const maskName = (n = '') => {
  const p = String(n).trim().split(/\s+/)
  return p.length < 3 ? n : `${p[0]} ${p.slice(1, -1).map((x) => x[0] + '.').join(' ')} ${p[p.length - 1]}`
}

router.patch('/:id/cancel', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body || {})
  res.json(await dispatch.cancel(id, req.user, reason))
}))

router.post('/:id/accept', requireRole('DOCTOR'), ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  res.json(await dispatch.respond(req.user.doctorId, id, true, { actorUserId: req.user.id }))
}))

router.post('/:id/reject', requireRole('DOCTOR'), ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body || {})
  await dispatch.respond(req.user.doctorId, id, false, { reason, actorUserId: req.user.id })
  res.json({ ok: true })
}))

module.exports = finalize(router)
