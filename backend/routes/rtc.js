/**
 * /api/rtc – signaling cho Video Consultation (WebRTC).
 * Media đi peer-to-peer giữa 2 trình duyệt; server chỉ chuyển tiếp offer/answer/ICE qua SSE (RTC_SIGNAL).
 * Chỉ cho phép khi Booking ở trạng thái CONFIRMED hoặc IN_PROGRESS và người gọi là người bệnh/bác sĩ của booking.
 */
const { z } = require('zod')
const { createRouter, finalize, ah, HttpError } = require('../lib/http')
const { one } = require('../lib/db')
const { requireAuth } = require('../lib/auth')
const events = require('../lib/events')

const router = createRouter()
router.use(requireAuth)

const cache = new Map() // bookingId → { at, pu, du, status, code }
const TTL = 30_000

async function access(bookingId, fresh) {
  const c = cache.get(bookingId)
  if (c && !fresh && Date.now() - c.at < TTL) return c
  const r = await one(
    `SELECT b.code, b.status, b.consultation_type, p.user_id AS pu, d.user_id AS du, u.full_name AS doctor_name, pu.full_name AS patient_name
     FROM bookings b JOIN patients p ON p.id = b.patient_id JOIN users pu ON pu.id = p.user_id
     LEFT JOIN doctors d ON d.id = b.doctor_id LEFT JOIN users u ON u.id = d.user_id WHERE b.id = $1`,
    [bookingId],
  )
  if (!r) throw new HttpError(404, 'Không tìm thấy lịch khám')
  const v = { ...r, at: Date.now() }
  cache.set(bookingId, v)
  return v
}

const TYPES = ['ring', 'accept', 'reject', 'offer', 'answer', 'ice', 'end', 'media']

router.post('/:bookingId/signal', ah(async (req, res) => {
  const bookingId = z.coerce.number().int().positive().parse(req.params.bookingId)
  const { type, data } = z.object({ type: z.enum(TYPES), data: z.any().optional() }).parse(req.body)
  const a = await access(bookingId, type === 'ring')
  if (req.user.id !== a.pu && req.user.id !== a.du) throw new HttpError(403, 'Bạn không tham gia lịch khám này')
  if (!['CONFIRMED', 'IN_PROGRESS'].includes(a.status)) throw new HttpError(409, 'Chỉ gọi video được khi lịch khám đã xác nhận hoặc đang diễn ra', 'VIDEO_NOT_ALLOWED')
  const to = req.user.id === a.pu ? a.du : a.pu
  if (type === 'ring' && !events.isOnline(to)) throw new HttpError(409, 'Người nhận đang không trực tuyến', 'PEER_OFFLINE')
  events.emit(to, 'RTC_SIGNAL', {
    bookingId, type, data, from: req.user.id,
    fromName: req.user.id === a.pu ? a.patient_name : a.doctor_name, code: a.code,
  })
  res.json({ ok: true, peerOnline: events.isOnline(to) })
}))

module.exports = finalize(router)
