/**
 * Bác sĩ mô phỏng (is_simulated = true) – giúp demo luồng Grab khi chỉ có một người dùng thật.
 *
 *  - Nhận lời mời: phản hồi sau 3–9 giây; chấp nhận với xác suất accept_prob
 *    (giảm 30% nếu khám trực tiếp và xa > 5 km); 10% không phản hồi → hệ thống AUTO REJECT sau 30s.
 *  - Sau khi nhận ca khám ngay: tự bắt đầu phiên sau ~12 giây, tự kết thúc sau ~2.5 phút
 *    với ghi chú mang tính tư vấn chung (không chẩn đoán).
 *  - Trả lời tin nhắn bằng câu mẫu.
 * Quyết định được tính bằng hàm băm của id → tái lập được (deterministic).
 */
const { q } = require('./db')
const dispatch = require('./dispatch')
const consultation = require('./consultation')
const events = require('./events')
const chat = require('./chat')

const START_AFTER_MS = 12_000
const END_AFTER_MS = 150_000

function hash01(n, salt = 0) {
  const x = Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

function decide(offer, ctx, doc) {
  const delayMs = (3 + Math.floor(hash01(offer.id, 1) * 7)) * 1000
  const silent = ctx.type === 'ON_DEMAND' && hash01(offer.id, 2) < 0.1
  let p = doc.acceptProb ?? 0.75
  if (ctx.consultationType === 'IN_PERSON' && offer.distance_km > 5) p *= 0.7
  if (ctx.type === 'SCHEDULED') p = Math.max(p, 0.9)
  return { delayMs, silent, accept: hash01(offer.id, 3) < p }
}

const hooks = {
  onOffer(ctx, offer, doc, { immediate = false } = {}) {
    const d = decide(offer, ctx, doc)
    if (d.silent) return // để hệ thống tự AUTO REJECT sau 30s
    setTimeout(() => {
      dispatch
        .respond(doc.id, ctx.id, d.accept, { reason: d.accept ? null : 'Đang bận (bác sĩ mô phỏng)', actorUserId: doc.userId })
        .catch((e) => e.code !== 'OFFER_CLOSED' && console.warn('[bots] respond failed', e.message))
    }, immediate ? 500 : d.delayMs)
  },
  onAccepted(booking, doc, conversationId) {
    setTimeout(() => botMessage(conversationId, doc.userId, 'Chào bạn, tôi đã nhận lịch khám. Bạn mô tả thêm triệu chứng giúp tôi nhé. (bác sĩ mô phỏng)').catch(() => {}), 1500)
    if (booking.type === 'ON_DEMAND') scheduleLifecycle(booking.id, doc, START_AFTER_MS)
  },
}
dispatch.setBotHooks(hooks)

function scheduleLifecycle(bookingId, doc, startInMs) {
  setTimeout(async () => {
    try {
      await consultation.start(bookingId, doc.id, doc.userId)
      setTimeout(() => endSession(bookingId, doc).catch(() => {}), END_AFTER_MS)
    } catch (e) {
      if (e.status !== 409) console.warn('[bots] start failed', e.message)
    }
  }, startInMs)
}

const endSession = (bookingId, doc) =>
  consultation.end(bookingId, doc.id, doc.userId, {
    notes: '[Dữ liệu mô phỏng] Đã trao đổi về các triệu chứng người bệnh mô tả.',
    advice: 'Nghỉ ngơi hợp lý, uống đủ nước, theo dõi triệu chứng. Đến cơ sở y tế gần nhất nếu triệu chứng nặng lên.',
    followUp: 'Tái khám sau 3–5 ngày nếu triệu chứng không cải thiện.',
  }).catch((e) => e.status !== 409 && console.warn('[bots] end failed', e.message))

async function botMessage(conversationId, senderUserId, content) {
  // Tin nhắn lưu MongoDB; chat.addMessage tự đẩy NEW_MESSAGE cho thành viên
  await chat.addMessage(conversationId, senderUserId, content, 'TEXT')
}

const REPLIES = [
  'Cảm ơn bạn đã chia sẻ. Triệu chứng này xuất hiện từ khi nào vậy?',
  'Bạn có đang dùng thuốc gì không? Nếu có hãy cho tôi biết tên thuốc.',
  'Tôi đã ghi nhận. Trong phiên khám tôi sẽ hỏi thêm một số thông tin nhé.',
  'Bạn nhớ nghỉ ngơi và uống đủ nước. Nếu thấy khó thở hoặc sốt cao liên tục, hãy đến cơ sở y tế ngay.',
]

/** Gọi khi người bệnh nhắn cho bác sĩ mô phỏng */
function scheduleReply(conversationId, doctorUserId, seed, patientUserId) {
  setTimeout(() => events.emit(patientUserId, 'TYPING', { conversationId, userId: doctorUserId }), 900)
  setTimeout(() => {
    botMessage(conversationId, doctorUserId, `${REPLIES[Math.floor(hash01(seed, 4) * REPLIES.length)]} (bác sĩ mô phỏng)`).catch(() => {})
  }, 2600)
}

/**
 * Bộ quét phục hồi (1 truy vấn / 45 giây): sau khi server khởi động lại, các hẹn giờ trong RAM mất →
 * xử lý lời mời quá hạn, lời mời còn hiệu lực, và ca khám của bác sĩ mô phỏng bị "treo".
 */
let firstSweep = true
async function recoverySweep() {
  const rows = await q(
    `SELECT 'expired' AS kind, r.booking_id, r.doctor_id, b.type, r.expires_at, NULL::text AS status, r.offered_at
       FROM booking_requests r JOIN bookings b ON b.id = r.booking_id
      WHERE r.status = 'OFFERED' AND r.expires_at <= now() - interval '2 seconds'
     UNION ALL
     SELECT 'pending', r.booking_id, r.doctor_id, b.type, r.expires_at, NULL, r.offered_at
       FROM booking_requests r JOIN bookings b ON b.id = r.booking_id
      WHERE r.status = 'OFFERED' AND r.expires_at > now()
     UNION ALL
     SELECT 'progress', b.id, b.doctor_id, b.type, NULL, b.status, NULL
       FROM bookings b JOIN doctors d ON d.id = b.doctor_id
      WHERE d.is_simulated AND NOT b.is_simulated AND (
            (b.status = 'CONFIRMED' AND ((b.type = 'ON_DEMAND' AND b.accepted_at < now() - interval '30 seconds') OR (b.type = 'SCHEDULED' AND b.scheduled_at <= now())))
         OR (b.status = 'IN_PROGRESS' AND b.started_at < now() - interval '200 seconds'))
     LIMIT 50`,
  )
  const directory = require('./directory')
  await dispatch.recoverExpired(rows.filter((r) => r.kind === 'expired'))
  const pending = rows.filter((r) => r.kind === 'pending')
  await dispatch.restorePending(pending)
  // Lời mời tới bác sĩ mô phỏng bị "treo" (hẹn giờ trong RAM bị mất do server khởi động lại):
  // lần quét đầu xử lý tất cả, các lần sau xử lý lời mời đã chờ quá 20 giây.
  const stale = pending.filter((r) => firstSweep || Date.now() - new Date(r.offered_at).getTime() > 20_000)
  firstSweep = false
  await resumeSimulatedOffers(stale)
  for (const r of rows.filter((x) => x.kind === 'progress')) {
    const doc = directory.get(r.doctor_id)
    if (!doc) continue
    if (r.status === 'CONFIRMED') scheduleLifecycle(r.booking_id, doc, 500)
    else await endSession(r.booking_id, doc)
  }
  return rows.length
}

/** Lời mời đang chờ bác sĩ mô phỏng sau khi khởi động lại → cho phản hồi ngay */
async function resumeSimulatedOffers(pendingRows) {
  const directory = require('./directory')
  for (const r of pendingRows) {
    const doc = directory.get(r.doctor_id)
    if (!doc?.isSimulated) continue
    const ctx = await dispatch.getCtx(r.booking_id)
    if (ctx) hooks.onOffer(ctx, { id: r.booking_id * 31 + r.doctor_id, distance_km: 0 }, doc, { immediate: true })
  }
}

module.exports = { hooks, scheduleReply, botMessage, recoverySweep, resumeSimulatedOffers }
