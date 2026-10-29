/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  REAL-TIME DISPATCH (mô phỏng Grab)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Patient Request ─► PENDING ─► SEARCHING ─► Matching Engine (Top-K = 5)
 *        ─► mời bác sĩ #1 (OFFERED, hạn 30 giây)
 *             ├─ Accept  ─► ACCEPTED ─► CONFIRMED (tạo phòng chat, thông báo)
 *             ├─ Reject  ─► SEARCHING ─► mời bác sĩ #2 …
 *             └─ Timeout ─► AUTO REJECT (EXPIRED) ─► SEARCHING ─► mời bác sĩ #2 …
 *        ─► hết danh sách ─► NO_DOCTOR_FOUND
 *
 *  Thiết kế:
 *   - Mỗi bước là MỘT truy vấn SQL dùng data-modifying CTE (cập nhật booking + ghi offer + log
 *     + thông báo cùng lúc) → nguyên tử, chống race (điều kiện WHERE status = …), tiết kiệm I/O.
 *   - Ứng viên lấy từ Doctor Directory trong RAM → matching không tốn truy vấn.
 *   - Hẹn giờ 30s chạy trong bộ nhớ; hạn chót đồng thời lưu ở DB (expires_at) và bộ quét phục hồi
 *     chạy định kỳ để xử lý nếu server khởi động lại.
 */
const { q, one } = require('./db')
const { rankDoctors, normalizeWeights } = require('./matching')
const sm = require('./stateMachine')
const events = require('./events')
const directory = require('./directory')
const catalog = require('./catalog')
const { HttpError } = require('./http')
const { notifySync } = require('./notify')
const chat = require('./chat')
const telemetry = require('./telemetry')

const OFFER_TIMEOUT_SEC = 30
const TOP_K = 5
const RADIUS_STEPS = [1, 3, 5, 10]

const ctxs = new Map() // bookingId → ngữ cảnh dispatch trong bộ nhớ
const timers = new Map() // bookingId → timeout handle
let botHooks = null // gắn từ bots.js (tránh vòng phụ thuộc)
const setBotHooks = (h) => (botHooks = h)

function newCode() {
  return `MG${Date.now().toString(36).slice(-5).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0')}`
}

// ───────────────────────── Matching ─────────────────────────
/**
 * Tìm Top-K bác sĩ; mở rộng bán kính 1 → 3 → 5 → 10 km nếu không có ai.
 * Bác sĩ đang có lời mời khám ngay khác (chưa trả lời) bị loại để không mời trùng.
 */
async function findDoctors({ lat, lng, specialtyId, consultationType, radiusKm = 5, algorithm = 'multi', weights, limit = TOP_K, exclude = new Set(), expand = true }) {
  const t0 = process.hrtime.bigint()
  await directory.ensure()
  // Giống Grab: bác sĩ thật chỉ nhận được lời mời khi ứng dụng đang kết nối real-time (presence).
  // Bác sĩ mô phỏng luôn "kết nối".
  const pool = directory.all().filter((d) => d.isActive && !exclude.has(d.id) && !d.pendingOffer && (d.isSimulated || events.isOnline(d.userId)))
  const relatedSpecialtyIds = specialtyId ? await catalog.relatedIds(specialtyId) : []
  const steps = expand ? [radiusKm, ...RADIUS_STEPS.filter((r) => r > radiusKm)] : [radiusKm]
  let result = null
  let usedRadius = radiusKm
  for (const r of steps) {
    usedRadius = r
    result = rankDoctors(pool, { lat, lng, specialtyId, relatedSpecialtyIds, consultationType, radiusKm: r }, { algorithm, weights, limit })
    if (result.ranked.length) break
  }
  return {
    ...result,
    radiusKm: usedRadius,
    poolSize: pool.length,
    totalMs: Number(process.hrtime.bigint() - t0) / 1e6,
    ranked: result.ranked.map((c) => {
      const d = directory.get(c.doctorId)
      return { ...c, name: d?.name, userId: d?.userId, isSimulated: d?.isSimulated }
    }),
  }
}

// ───────────────────────── Context ─────────────────────────
async function getCtx(bookingId) {
  if (ctxs.has(bookingId)) return ctxs.get(bookingId)
  const b = await one(
    `SELECT b.*, p.user_id AS patient_user_id, u.full_name AS patient_name, s.name AS specialty_name,
            COALESCE((SELECT string_agg(doctor_id::text, ',') FROM booking_requests r WHERE r.booking_id = b.id), '') AS offered
     FROM bookings b JOIN patients p ON p.id = b.patient_id JOIN users u ON u.id = p.user_id
     LEFT JOIN specialties s ON s.id = b.specialty_id WHERE b.id = $1`,
    [bookingId],
  )
  if (!b) return null
  const ctx = makeCtx(b)
  b.offered.split(',').filter(Boolean).forEach((id) => ctx.offered.add(Number(id)))
  ctxs.set(b.id, ctx)
  return ctx
}

function makeCtx(b) {
  return {
    id: b.id, code: b.code, type: b.type, status: b.status, patientId: b.patient_id, patientUserId: b.patient_user_id,
    patientName: b.patient_name, specialtyId: b.specialty_id, specialtyName: b.specialty_name, consultationType: b.consultation_type,
    symptoms: b.symptoms, address: b.address, lat: b.patient_lat, lng: b.patient_lng, scheduledAt: b.scheduled_at,
    algorithm: b.algorithm || 'multi', weights: b.weights, radiusKm: b.search_radius_km || 5,
    candidates: b.candidates?.list || [], offered: new Set(), offer: null, fee: b.fee,
  }
}

function clearTimer(bookingId) {
  const t = timers.get(bookingId)
  if (t) clearTimeout(t)
  timers.delete(bookingId)
}

function releaseDoctorOffer(doctorId, bookingId) {
  const d = directory.get(doctorId)
  if (d && d.pendingOffer === bookingId) d.pendingOffer = null
}

// ───────────────────────── On-demand ─────────────────────────
async function createOnDemand(user, input) {
  if (!user.patientId) throw new HttpError(403, 'Chỉ người bệnh mới gửi được yêu cầu khám')
  sm.assertTransition('PENDING', 'SEARCHING')
  const weights = normalizeWeights(input.weights)
  const row = await one(
    `WITH p AS (SELECT p.id, u.id AS user_id, u.full_name FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = $1),
     active AS (SELECT code FROM bookings WHERE patient_id = $1 AND type = 'ON_DEMAND' AND status IN ('PENDING','SEARCHING','OFFERED') LIMIT 1),
     b AS (
       INSERT INTO bookings (code, patient_id, specialty_id, type, consultation_type, status, patient_lat, patient_lng, address, symptoms, algorithm, weights, search_radius_km)
       SELECT $2, p.id, $3, 'ON_DEMAND', $4, 'SEARCHING', $5, $6, $7, $8, $9, $10::jsonb, $11 FROM p WHERE NOT EXISTS (SELECT 1 FROM active)
       RETURNING *),
     l AS (
       INSERT INTO booking_status_logs (booking_id, from_status, to_status, actor_id, note, created_at)
       SELECT id, NULL, 'PENDING', $12::int, 'Người bệnh gửi yêu cầu khám ngay', now() FROM b
       UNION ALL SELECT id, 'PENDING', 'SEARCHING', NULL, 'Matching Engine bắt đầu tìm bác sĩ', now() + interval '1 millisecond' FROM b)
     SELECT (SELECT row_to_json(b) FROM b) AS booking, (SELECT code FROM active) AS active_code,
            (SELECT full_name FROM p) AS patient_name, (SELECT name FROM specialties WHERE id = $3) AS specialty_name`,
    [user.patientId, newCode(), input.specialtyId, input.consultationType, input.lat, input.lng, input.address || null, input.symptoms || null,
      input.algorithm || 'multi', JSON.stringify(weights), input.radiusKm || 5, user.id],
  )
  if (row.active_code) throw new HttpError(409, `Bạn đang có yêu cầu ${row.active_code} chờ bác sĩ. Hãy hủy hoặc đợi kết quả trước khi gửi yêu cầu mới.`, 'ACTIVE_REQUEST')
  if (!row.booking) throw new HttpError(404, 'Không tìm thấy hồ sơ người bệnh')
  const ctx = makeCtx({ ...row.booking, patient_user_id: user.id, patient_name: row.patient_name, specialty_name: row.specialty_name })
  ctxs.set(ctx.id, ctx)
  emitStatus(ctx, 'SEARCHING')

  // Matching Engine (trong bộ nhớ)
  const result = await findDoctors({ lat: ctx.lat, lng: ctx.lng, specialtyId: ctx.specialtyId, consultationType: ctx.consultationType, radiusKm: ctx.radiusKm, algorithm: ctx.algorithm, weights })
  ctx.candidates = result.ranked
  ctx.radiusKm = result.radiusKm
  ctx.matching = { eligible: result.eligibleCount, pool: result.poolSize, computeMs: result.elapsedMs, totalMs: result.totalMs, weights: result.weights, radiusKm: result.radiusKm }
  console.log(`[dispatch] ${ctx.code}: ${result.ranked.length} ứng viên / ${result.eligibleCount} đủ điều kiện (r=${result.radiusKm}km, ${result.totalMs.toFixed(2)}ms)`)
  await offerNext(ctx, { saveCandidates: true })
  return { ...row.booking, status: ctx.status, candidates: { list: ctx.candidates, ...ctx.matching } }
}

/** Mời ứng viên kế tiếp (1 truy vấn). Bỏ qua ứng viên đã offline/bận/đang có lời mời khác. */
async function offerNext(ctx, { saveCandidates = false } = {}) {
  let next = null
  for (const c of ctx.candidates) {
    if (ctx.offered.has(c.doctorId)) continue
    const d = directory.get(c.doctorId)
    if (!d || d.status !== 'ONLINE' || d.availability !== 'AVAILABLE' || (d.pendingOffer && d.pendingOffer !== ctx.id)) {
      ctx.offered.add(c.doctorId)
      c.skipped = 'Không còn sẵn sàng'
      continue
    }
    next = c
    break
  }
  const candidatesJson = saveCandidates || !next ? JSON.stringify({ list: ctx.candidates, ...(ctx.matching || {}) }) : null

  if (!next) {
    const row = await one(
      `WITH b AS (UPDATE bookings SET status = 'NO_DOCTOR_FOUND', updated_at = now(), candidates = COALESCE($2::jsonb, candidates),
                    matching_ms = COALESCE($3, matching_ms), search_radius_km = COALESCE($4, search_radius_km)
                  WHERE id = $1 AND status = 'SEARCHING' RETURNING id),
       l AS (INSERT INTO booking_status_logs (booking_id, from_status, to_status, note) SELECT id, 'SEARCHING', 'NO_DOCTOR_FOUND', $5 FROM b)
       SELECT (SELECT count(*) FROM b)::int AS updated`,
      [ctx.id, candidatesJson, ctx.matching?.totalMs ?? null, ctx.radiusKm, `Đã thử ${ctx.offered.size} bác sĩ, không ai nhận`],
    )
    if (row.updated) {
      ctx.status = 'NO_DOCTOR_FOUND'
      emitStatus(ctx, 'NO_DOCTOR_FOUND')
      pushNotification({ userId: ctx.patientUserId, type: 'NO_DOCTOR_FOUND', title: 'Chưa tìm được bác sĩ', body: 'Hiện chưa có bác sĩ phù hợp nhận yêu cầu. Bạn có thể thử lại với bán kính lớn hơn.', data: { bookingId: ctx.id } })
      telemetry.dispatchEvent({ event: 'NO_DOCTOR_FOUND', bookingId: ctx.id, code: ctx.code, algorithm: ctx.algorithm, triedDoctors: ctx.offered.size, radiusKm: ctx.radiusKm })
      ctxs.delete(ctx.id)
    }
    return null
  }

  const doc = directory.get(next.doctorId)
  doc.pendingOffer = ctx.id // giữ chỗ ngay trong bộ nhớ để booking khác không mời trùng
  const row = await one(
    `WITH b AS (UPDATE bookings SET status = 'OFFERED', updated_at = now(), candidates = COALESCE($7::jsonb, candidates),
                  matching_ms = COALESCE($8, matching_ms), search_radius_km = COALESCE($9, search_radius_km)
                WHERE id = $1 AND status = 'SEARCHING' RETURNING id),
     r AS (INSERT INTO booking_requests (booking_id, doctor_id, rank, score, distance_km, status, expires_at)
           SELECT id, $2, $3, $4, $5, 'OFFERED', now() + make_interval(secs => $10::int) FROM b RETURNING *),
     l AS (INSERT INTO booking_status_logs (booking_id, from_status, to_status, note) SELECT id, 'SEARCHING', 'OFFERED', $6 FROM b)
     SELECT (SELECT row_to_json(r) FROM r) AS offer`,
    [ctx.id, next.doctorId, next.rank, next.score, next.distanceKm, `Gửi yêu cầu tới bác sĩ #${next.rank} (${next.name}, ${next.score} điểm)`,
      candidatesJson, ctx.matching?.totalMs ?? null, ctx.radiusKm, OFFER_TIMEOUT_SEC],
  )
  if (!row.offer) {
    // booking đã bị hủy trong lúc chờ
    doc.pendingOffer = null
    ctxs.delete(ctx.id)
    return null
  }
  ctx.offered.add(next.doctorId)
  ctx.status = 'OFFERED'
  ctx.offer = { id: row.offer.id, doctorId: next.doctorId, expiresAt: row.offer.expires_at }
  armTimer(ctx.id, next.doctorId, new Date(row.offer.expires_at).getTime() - Date.now())

  emitStatus(ctx, 'OFFERED', { offer: { doctorId: next.doctorId, name: next.name, rank: next.rank, score: next.score, distanceKm: next.distanceKm, expiresAt: row.offer.expires_at } })
  events.emit(doc.userId, 'NEW_BOOKING_REQUEST', offerPayload(ctx, row.offer))
  pushNotification({ userId: doc.userId, type: 'NEW_BOOKING_REQUEST', title: 'Yêu cầu khám ngay', body: `${ctx.specialtyName || 'Khám bệnh'} · cách ${next.distanceKm} km · phản hồi trong ${OFFER_TIMEOUT_SEC}s`, data: { bookingId: ctx.id } })
  telemetry.dispatchEvent({ event: 'OFFERED', bookingId: ctx.id, code: ctx.code, type: ctx.type, algorithm: ctx.algorithm, doctorId: next.doctorId, doctorName: next.name, rank: next.rank, score: next.score, distanceKm: next.distanceKm, components: next.components, expiresAt: new Date(row.offer.expires_at) })
  if (doc.isSimulated && botHooks) botHooks.onOffer(ctx, row.offer, doc)
  return row.offer
}

function armTimer(bookingId, doctorId, ms) {
  clearTimer(bookingId)
  if (ms > 60 * 60 * 1000) return // lời mời dài hạn (đặt lịch) → bộ quét phục hồi xử lý
  timers.set(bookingId, setTimeout(() => {
    timers.delete(bookingId)
    closeOffer(bookingId, doctorId, 'EXPIRED', { reason: 'Hết thời gian phản hồi (auto reject)' }).catch((e) => console.warn('[dispatch] expire failed', e.message))
  }, Math.max(0, ms) + 300))
}

function offerPayload(ctx, offer) {
  return {
    offerId: offer.id, bookingId: ctx.id, code: ctx.code, type: ctx.type, consultationType: ctx.consultationType,
    specialty: ctx.specialtyName, patientName: shortName(ctx.patientName), symptoms: ctx.symptoms,
    address: ctx.consultationType === 'IN_PERSON' ? ctx.address : null, distanceKm: offer.distance_km, score: offer.score,
    scheduledAt: ctx.scheduledAt, expiresAt: offer.expires_at, timeoutSec: OFFER_TIMEOUT_SEC,
  }
}

/** Ẩn tên đệm khi bác sĩ chưa nhận ca: "Nguyễn Văn An" → "Nguyễn V. An" (giảm lộ thông tin cá nhân) */
function shortName(n = '') {
  const p = String(n).trim().split(/\s+/)
  if (p.length < 3) return n
  return `${p[0]} ${p.slice(1, -1).map((x) => x[0] + '.').join(' ')} ${p[p.length - 1]}`
}

// ───────────────────────── Doctor response ─────────────────────────
async function respond(doctorId, bookingId, accept, { reason, actorUserId } = {}) {
  const ctx = await getCtx(bookingId)
  if (!ctx) throw new HttpError(404, 'Không tìm thấy yêu cầu')
  if (accept) return acceptOffer(ctx, doctorId, actorUserId)
  return closeOffer(bookingId, doctorId, 'REJECTED', { reason, actorUserId })
}

async function acceptOffer(ctx, doctorId, actorUserId) {
  const doc = directory.get(doctorId)
  if (!doc) throw new HttpError(404, 'Không tìm thấy bác sĩ')
  sm.assertTransition('OFFERED', 'ACCEPTED')
  const row = await one(
    `WITH r AS (UPDATE booking_requests SET status = 'ACCEPTED', responded_at = now(),
                  response_ms = (EXTRACT(EPOCH FROM (now() - offered_at)) * 1000)::int
                WHERE booking_id = $1 AND doctor_id = $2 AND status = 'OFFERED' AND expires_at > now() RETURNING *),
     b AS (UPDATE bookings SET status = 'CONFIRMED', doctor_id = $2, accepted_at = now(), updated_at = now(),
                  distance_km = COALESCE(r.distance_km, bookings.distance_km), fee = COALESCE(bookings.fee, $3)
           FROM r WHERE bookings.id = r.booking_id AND bookings.status = 'OFFERED' RETURNING bookings.*),
     l AS (INSERT INTO booking_status_logs (booking_id, from_status, to_status, actor_id, note, created_at)
           SELECT b.id, 'OFFERED', 'ACCEPTED', $4::int, $5 || ' chấp nhận sau ' || round((r.response_ms / 1000.0)::numeric, 1) || 's', now() FROM b, r
           UNION ALL SELECT id, 'ACCEPTED', 'CONFIRMED', NULL, 'Hệ thống xác nhận lịch khám', now() + interval '1 millisecond' FROM b)
     SELECT (SELECT row_to_json(b) FROM b) AS booking, (SELECT response_ms FROM r) AS response_ms, (SELECT rank FROM r) AS rank`,
    [ctx.id, doctorId, doc.fee, actorUserId || doc.userId, doc.name],
  )
  if (!row.booking) throw new HttpError(409, 'Yêu cầu này đã hết hạn hoặc đã được xử lý', 'OFFER_CLOSED')
  clearTimer(ctx.id)
  releaseDoctorOffer(doctorId, ctx.id)
  if (ctx.type === 'ON_DEMAND') directory.adjustLoad(doctorId, +1)
  ctx.status = 'CONFIRMED'
  events.emit(ctx.patientUserId, 'BOOKING_ACCEPTED', { bookingId: ctx.id, doctorId, doctorName: doc.name })
  emitStatus(ctx, 'CONFIRMED', { doctorId }, [doc.userId])
  pushNotification({ userId: ctx.patientUserId, type: 'BOOKING_ACCEPTED', title: 'Bác sĩ đã nhận lịch', body: `${doc.name} đã chấp nhận yêu cầu ${ctx.code}.`, data: { bookingId: ctx.id } })
  telemetry.dispatchEvent({ event: 'ACCEPTED', bookingId: ctx.id, code: ctx.code, type: ctx.type, algorithm: ctx.algorithm, doctorId, doctorName: doc.name, rank: row.rank, responseMs: row.response_ms })
  ctxs.delete(ctx.id)
  // Phòng chat (MongoDB) – lỗi chat không làm hỏng việc nhận ca
  const conversationId = await chat
    .ensureConversation(ctx.id, [ctx.patientUserId, doc.userId], `${doc.name} đã nhận lịch khám. Hai bên có thể nhắn tin tại đây.`)
    .catch((e) => console.warn('[dispatch] tạo phòng chat thất bại', e.message))
  if (doc.isSimulated && botHooks) botHooks.onAccepted(row.booking, doc, conversationId || ctx.id)
  return row.booking
}

/**
 * Đóng lời mời (REJECTED do bác sĩ / EXPIRED do hết giờ).
 *   - Khám ngay: OFFERED → SEARCHING rồi mời người kế tiếp.
 *   - Đặt lịch: OFFERED → REJECTED / EXPIRED, mở lại slot.
 */
async function closeOffer(bookingId, doctorId, outcome, { reason, actorUserId } = {}) {
  const ctx = await getCtx(bookingId)
  if (!ctx) return null
  const doc = directory.get(doctorId)
  const nextStatus = ctx.type === 'ON_DEMAND' ? 'SEARCHING' : outcome
  sm.assertTransition('OFFERED', nextStatus)
  const note = ctx.type === 'ON_DEMAND'
    ? outcome === 'EXPIRED'
      ? `${doc?.name || 'Bác sĩ'} không phản hồi trong ${OFFER_TIMEOUT_SEC}s → AUTO REJECT, chuyển bác sĩ kế tiếp`
      : `${doc?.name || 'Bác sĩ'} từ chối${reason ? `: ${reason}` : ''} → chuyển bác sĩ kế tiếp`
    : outcome === 'EXPIRED' ? 'Bác sĩ không xác nhận trước giờ hẹn' : `${doc?.name || 'Bác sĩ'} từ chối lịch hẹn${reason ? `: ${reason}` : ''}`
  const notifyPatient = ctx.type !== 'ON_DEMAND'
  const row = await one(
    `WITH r AS (UPDATE booking_requests SET status = $3, responded_at = now(), reason = $4,
                  response_ms = (EXTRACT(EPOCH FROM (now() - offered_at)) * 1000)::int
                WHERE booking_id = $1 AND doctor_id = $2 AND status = 'OFFERED' RETURNING *),
     b AS (UPDATE bookings SET status = $5, updated_at = now() FROM r WHERE bookings.id = r.booking_id AND bookings.status = 'OFFERED' RETURNING bookings.id),
     s AS (UPDATE appointment_slots SET status = 'AVAILABLE', booking_id = NULL
           WHERE booking_id = $1 AND $5 <> 'SEARCHING' AND start_at > now() AND EXISTS (SELECT 1 FROM b)),
     l AS (INSERT INTO booking_status_logs (booking_id, from_status, to_status, actor_id, note) SELECT id, 'OFFERED', $5, $6::int, $7 FROM b)
     SELECT (SELECT count(*) FROM r)::int AS closed, (SELECT count(*) FROM b)::int AS moved, (SELECT response_ms FROM r) AS response_ms, (SELECT rank FROM r) AS rank`,
    [bookingId, doctorId, outcome, reason || null, nextStatus, actorUserId || null, note],
  )
  if (!row.closed) {
    if (outcome === 'REJECTED') throw new HttpError(409, 'Yêu cầu này đã hết hạn hoặc đã được xử lý', 'OFFER_CLOSED')
    return null
  }
  clearTimer(bookingId)
  releaseDoctorOffer(doctorId, bookingId)
  if (doc) events.emit(doc.userId, 'OFFER_CANCELLED', { bookingId, reason: outcome })
  events.emit(ctx.patientUserId, 'BOOKING_REJECTED', { bookingId, doctorId, doctorName: doc?.name, outcome, reason })
  if (notifyPatient && row.moved) pushNotification({ userId: ctx.patientUserId, type: 'BOOKING_REJECTED', title: 'Lịch hẹn không được xác nhận', body: `${note}. Khung giờ đã được mở lại, bạn có thể chọn giờ khác.`, data: { bookingId } })
  telemetry.dispatchEvent({ event: outcome, bookingId, code: ctx.code, type: ctx.type, algorithm: ctx.algorithm, doctorId, doctorName: doc?.name, rank: row.rank, responseMs: row.response_ms, reason: reason || null })
  if (!row.moved) return null
  ctx.status = nextStatus
  ctx.offer = null
  emitStatus(ctx, nextStatus, { lastOutcome: outcome })
  if (nextStatus === 'SEARCHING') await offerNext(ctx)
  else ctxs.delete(bookingId)
  return null
}

// ───────────────────────── Scheduled booking ─────────────────────────
async function createScheduled(user, { doctorId, slotId, consultationType, symptoms }) {
  if (!user.patientId) throw new HttpError(403, 'Chỉ người bệnh mới đặt được lịch')
  await directory.ensure()
  const doc = directory.get(doctorId)
  if (!doc || !doc.verified) throw new HttpError(400, 'Bác sĩ chưa được xác minh')
  if (!doc.consultationTypes.includes(consultationType)) throw new HttpError(400, 'Bác sĩ không hỗ trợ hình thức khám này')

  /*
   * Chống double booking (1 truy vấn nguyên tử):
   *   UPDATE appointment_slots SET status='BOOKED' WHERE id=? AND status='AVAILABLE'
   * Postgres khóa dòng khi UPDATE → khi 2 người cùng đặt, chỉ một UPDATE thỏa điều kiện,
   * người còn lại nhận 0 dòng → 409. Booking chỉ được tạo khi slot CTE trả về dòng.
   */
  const row = await one(
    `WITH ids AS (SELECT nextval(pg_get_serial_sequence('bookings', 'id')) AS bid),
     pt AS (SELECT p.id, p.latitude, p.longitude, p.address, u.full_name FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = $1),
     clash AS (SELECT b.code FROM bookings b JOIN appointment_slots s ON s.id = $2
               WHERE b.patient_id = $1 AND b.scheduled_at = s.start_at AND b.status IN ('OFFERED','ACCEPTED','CONFIRMED','IN_PROGRESS') LIMIT 1),
     slot AS (UPDATE appointment_slots SET status = 'BOOKED', booking_id = (SELECT bid FROM ids)
              WHERE id = $2 AND doctor_id = $3 AND status = 'AVAILABLE' AND start_at > now() AND NOT EXISTS (SELECT 1 FROM clash)
              RETURNING *),
     b AS (INSERT INTO bookings (id, code, patient_id, doctor_id, specialty_id, type, consultation_type, status, slot_id, scheduled_at,
                                 patient_lat, patient_lng, address, symptoms, fee, distance_km)
           SELECT ids.bid, $4, pt.id, $3, $5, 'SCHEDULED', $6, 'OFFERED', slot.id, slot.start_at, pt.latitude, pt.longitude, pt.address, $7, $8,
                  CASE WHEN pt.latitude IS NULL THEN NULL ELSE 6371 * 2 * asin(sqrt(power(sin(radians($9 - pt.latitude) / 2), 2)
                       + cos(radians(pt.latitude)) * cos(radians($9)) * power(sin(radians($10 - pt.longitude) / 2), 2))) END
           FROM ids, pt, slot RETURNING *),
     r AS (INSERT INTO booking_requests (booking_id, doctor_id, rank, distance_km, status, expires_at)
           SELECT id, $3, 1, distance_km, 'OFFERED', LEAST(scheduled_at, now() + interval '12 hours') FROM b RETURNING *),
     l AS (INSERT INTO booking_status_logs (booking_id, from_status, to_status, actor_id, note, created_at)
           SELECT id, NULL, 'PENDING', $11::int, 'Người bệnh đặt lịch', now() FROM b
           UNION ALL SELECT id, 'PENDING', 'OFFERED', NULL, $12, now() + interval '1 millisecond' FROM b)
     SELECT (SELECT row_to_json(b) FROM b) AS booking, (SELECT row_to_json(r) FROM r) AS offer,
            (SELECT to_char(scheduled_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') FROM b) AS when_text,
            (SELECT code FROM clash) AS clash_code, (SELECT full_name FROM pt) AS patient_name, (SELECT name FROM specialties WHERE id = $5) AS specialty_name`,
    [user.patientId, slotId, doctorId, newCode(), doc.specialtyId, consultationType, symptoms || null, doc.fee, doc.lat, doc.lng, user.id, `Chờ ${doc.name} xác nhận`],
  )
  if (row.clash_code) throw new HttpError(409, `Bạn đã có lịch ${row.clash_code} vào cùng thời điểm`, 'PATIENT_CLASH')
  if (!row.booking) throw new HttpError(409, 'Khung giờ này vừa có người đặt hoặc không còn khả dụng. Vui lòng chọn giờ khác.', 'SLOT_TAKEN')

  const ctx = makeCtx({ ...row.booking, patient_user_id: user.id, patient_name: row.patient_name, specialty_name: row.specialty_name })
  ctx.offered.add(doctorId)
  ctx.offer = { id: row.offer.id, doctorId, expiresAt: row.offer.expires_at }
  ctxs.set(ctx.id, ctx)
  armTimer(ctx.id, doctorId, new Date(row.offer.expires_at).getTime() - Date.now())
  events.emit(doc.userId, 'NEW_BOOKING_REQUEST', offerPayload(ctx, row.offer))
  pushNotification({ userId: doc.userId, type: 'NEW_BOOKING_REQUEST', title: 'Lịch hẹn mới cần xác nhận', body: `${row.patient_name} đặt lịch ${row.when_text}`, data: { bookingId: ctx.id } })
  telemetry.dispatchEvent({ event: 'OFFERED', bookingId: ctx.id, code: ctx.code, type: 'SCHEDULED', doctorId, doctorName: doc.name, rank: 1, distanceKm: row.offer.distance_km, expiresAt: new Date(row.offer.expires_at) })
  emitStatus(ctx, 'OFFERED')
  if (doc.isSimulated && botHooks) botHooks.onOffer(ctx, row.offer, doc)
  return row.booking
}

// ───────────────────────── Cancel ─────────────────────────
async function cancel(bookingId, user, reason) {
  const allowed = sm.allowedFrom('CANCELLED').join(',')
  const row = await one(
    `WITH cur AS (SELECT b.id, b.status, b.code, b.type, b.doctor_id, p.user_id AS pu, d.user_id AS du
                  FROM bookings b JOIN patients p ON p.id = b.patient_id LEFT JOIN doctors d ON d.id = b.doctor_id WHERE b.id = $1),
     ok AS (SELECT * FROM cur WHERE status = ANY(string_to_array($2, ',')) AND ($3 = 'ADMIN' OR pu = $4 OR du = $4)),
     b AS (UPDATE bookings SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = $5, updated_at = now()
           FROM ok WHERE bookings.id = ok.id AND bookings.status = ok.status RETURNING bookings.id),
     r AS (UPDATE booking_requests SET status = 'CANCELLED', responded_at = now()
           WHERE booking_id = $1 AND status = 'OFFERED' AND EXISTS (SELECT 1 FROM b) RETURNING doctor_id),
     s AS (UPDATE appointment_slots SET status = 'AVAILABLE', booking_id = NULL WHERE booking_id = $1 AND start_at > now() AND EXISTS (SELECT 1 FROM b)),
     l AS (INSERT INTO booking_status_logs (booking_id, from_status, to_status, actor_id, note) SELECT ok.id, ok.status, 'CANCELLED', $4::int, $5 FROM ok, b)
     SELECT (SELECT row_to_json(cur) FROM cur) AS cur, (SELECT count(*) FROM b)::int AS updated,
            (SELECT json_agg(doctor_id) FROM r) AS offer_doctors`,
    [bookingId, allowed, user.role, user.id, reason || null],
  )
  if (!row.cur) throw new HttpError(404, 'Không tìm thấy lịch khám')
  const cur = row.cur
  if (!row.updated) {
    if (user.role !== 'ADMIN' && cur.pu !== user.id && cur.du !== user.id) throw new HttpError(403, 'Bạn không có quyền hủy lịch này')
    sm.assertTransition(cur.status, 'CANCELLED')
    throw new HttpError(409, 'Trạng thái lịch đã thay đổi, vui lòng tải lại')
  }
  clearTimer(bookingId)
  for (const did of row.offer_doctors || []) {
    releaseDoctorOffer(did, bookingId)
    const d = directory.get(did)
    if (d) events.emit(d.userId, 'OFFER_CANCELLED', { bookingId, reason: 'CANCELLED' })
  }
  if (cur.doctor_id && cur.type === 'ON_DEMAND' && ['ACCEPTED', 'CONFIRMED'].includes(cur.status)) directory.adjustLoad(cur.doctor_id, -1)
  ctxs.delete(bookingId)
  events.emit([cur.pu, cur.du].filter(Boolean), 'BOOKING_STATUS_CHANGED', { bookingId, code: cur.code, status: 'CANCELLED', previous: cur.status })
  const other = cur.pu === user.id ? cur.du : cur.pu
  if (other) pushNotification({ userId: other, type: 'BOOKING_CANCELLED', title: 'Lịch khám đã bị hủy', body: `Lịch ${cur.code} đã bị hủy${reason ? `: ${reason}` : ''}.`, data: { bookingId } })
  if (cur.type === 'ON_DEMAND' && ['SEARCHING', 'OFFERED'].includes(cur.status)) telemetry.dispatchEvent({ event: 'CANCELLED_BY_PATIENT', bookingId, code: cur.code, previousStatus: cur.status })
  return { id: bookingId, status: 'CANCELLED' }
}

// ───────────────────────── Recovery (sau khi khởi động lại) ─────────────────────────
/** Xử lý lời mời quá hạn mà bộ hẹn giờ trong RAM đã mất (1 truy vấn đọc) */
async function recoverExpired(rows) {
  for (const r of rows) {
    await closeOffer(r.booking_id, r.doctor_id, 'EXPIRED', { reason: 'Hết thời gian phản hồi (auto reject)' }).catch((e) => console.warn('[recover]', e.message))
  }
}

/** Khởi tạo lại cờ pendingOffer + hẹn giờ cho các lời mời còn hiệu lực */
async function restorePending(rows) {
  for (const r of rows) {
    const d = directory.get(r.doctor_id)
    if (r.type === 'ON_DEMAND' && d) d.pendingOffer = r.booking_id
    if (!timers.has(r.booking_id)) armTimer(r.booking_id, r.doctor_id, new Date(r.expires_at).getTime() - Date.now())
  }
}

// ───────────────────────── Events ─────────────────────────
function emitStatus(ctx, status, extra = {}, extraUsers = []) {
  const ids = [ctx.patientUserId, ...extraUsers].filter(Boolean)
  events.emit(ids, 'BOOKING_STATUS_CHANGED', { bookingId: ctx.id, code: ctx.code, status, ...extra })
}

/** Thông báo (MongoDB) – ghi qua bộ đệm, đẩy SSE ngay */
function pushNotification(item) {
  if (item && item.userId) notifySync(item)
}

module.exports = {
  OFFER_TIMEOUT_SEC, TOP_K, findDoctors, createOnDemand, offerNext, respond, closeOffer, createScheduled, cancel,
  recoverExpired, restorePending, pushNotification, newCode, setBotHooks, getCtx, activeContexts: () => ctxs.size,
}
