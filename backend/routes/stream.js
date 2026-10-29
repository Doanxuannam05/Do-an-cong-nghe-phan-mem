/**
 * /api/stream – luồng sự kiện real-time (Server-Sent Events) theo người dùng.
 * EventSource không gửi được header Authorization nên token được truyền qua ?token=.
 * Không truy vấn DB (xác thực JWT stateless).
 */
const { Router } = require('express')
const { verifyJwt } = require('../lib/auth')
const events = require('../lib/events')
const directory = require('../lib/directory')

const router = Router()

router.get('/', (req, res) => {
  const payload = verifyJwt(String(req.query.token || ''))
  if (!payload) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token không hợp lệ' } })
  const user = { id: payload.sub, role: payload.role }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(`retry: 3000\n\n`)
  const remove = events.addClient(user, res)
  events.write(res, 'CONNECTED', { userId: user.id, role: user.role })

  // Bác sĩ online/offline theo kết nối (chỉ báo hiệu presence, không đổi trạng thái nhận bệnh)
  if (user.role === 'DOCTOR' && payload.did) events.emitToRole('PATIENT', 'DOCTOR_PRESENCE', { doctorId: payload.did, connected: true })

  const ping = setInterval(() => events.write(res, 'PING', {}), 20000)
  req.on('close', () => {
    clearInterval(ping)
    remove()
    if (user.role === 'DOCTOR' && payload.did && !events.isOnline(user.id)) events.emitToRole('PATIENT', 'DOCTOR_PRESENCE', { doctorId: payload.did, connected: false })
  })
  void directory
})

/** Đo độ trễ WebSocket/SSE: client gửi thời điểm nhận event (ms) */
router.post('/latency', require('express').json(), (req, res) => {
  const ms = Number(req.body?.ms)
  if (Number.isFinite(ms) && ms >= 0 && ms < 60000) events.recordLatency(ms)
  res.json({ ok: true })
})

module.exports = router
