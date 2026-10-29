/**
 * /api/conversations – Chat Patient ↔ Doctor (PostgreSQL: conversations, participants, messages).
 * Phòng chat gắn với booking đã xác nhận (id phòng = id booking). Chỉ thành viên mới đọc/gửi được.
 * Real-time: NEW_MESSAGE, TYPING, MESSAGE_READ qua SSE.
 */
const { z } = require('zod')
const { createRouter, finalize, ah, HttpError, rateLimit } = require('../lib/http')
const { q, one } = require('../lib/db')
const { requireAuth } = require('../lib/auth')
const events = require('../lib/events')
const directory = require('../lib/directory')
const chat = require('../lib/chat')
const { notifySync } = require('../lib/notify')

const router = createRouter()
router.use(requireAuth)

// cache thành viên phòng (tránh truy vấn khi gửi "đang gõ…")
const members = new Map()
const remember = (cid, ids) => members.set(Number(cid), (ids || []).map(Number))

router.get('/', ah(async (req, res) => {
  const rows = await q(
    `SELECT c.id, c.id AS booking_id, c.last_message_at, c.last_message, b.code, b.status AS booking_status, b.consultation_type,
            o.user_id AS other_user_id, ou.full_name AS other_name, ou.role AS other_role, ou.avatar AS other_avatar,
            (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.type = 'TEXT' AND m.sender_id IS DISTINCT FROM $1
               AND m.created_at > COALESCE(me.last_read_at, 'epoch')) AS unread
     FROM participants me JOIN conversations c ON c.id = me.conversation_id JOIN bookings b ON b.id = c.id
     JOIN participants o ON o.conversation_id = c.id AND o.user_id <> $1 JOIN users ou ON ou.id = o.user_id
     WHERE me.user_id = $1 ORDER BY c.last_message_at DESC NULLS LAST LIMIT 50`,
    [req.user.id],
  )
  for (const r of rows) remember(r.id, [req.user.id, r.other_user_id])
  res.json(rows.map(({ last_message: lm, ...r }) => ({ ...r, last_message: lm || null, other_online: events.isOnline(r.other_user_id) })))
}))

router.get('/:id/messages', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const before = req.query.before ? new Date(String(req.query.before)) : null
  const row = await one(
    `SELECT (SELECT json_agg(user_id) FROM participants WHERE conversation_id = $1) AS members,
            (SELECT json_agg(m ORDER BY m.created_at, m.id) FROM (
               SELECT id, conversation_id, sender_id, type, content, created_at FROM messages
               WHERE conversation_id = $1 AND ($2::timestamptz IS NULL OR created_at < $2)
               ORDER BY created_at DESC, id DESC LIMIT 100) m) AS messages,
            (SELECT json_agg(json_build_object('user_id', p.user_id, 'last_read_at', p.last_read_at, 'full_name', u.full_name, 'role', u.role))
               FROM participants p JOIN users u ON u.id = p.user_id WHERE p.conversation_id = $1) AS participants,
            (SELECT row_to_json(b) FROM (SELECT id, code, status, consultation_type FROM bookings WHERE id = $1) b) AS booking`,
    [id, before && !Number.isNaN(before.getTime()) ? before.toISOString() : null],
  )
  if (!(row.members || []).includes(req.user.id)) throw new HttpError(403, 'Bạn không thuộc cuộc trò chuyện này')
  remember(id, row.members)
  res.json({
    messages: row.messages || [],
    participants: (row.participants || []).map((p) => ({ ...p, online: events.isOnline(p.user_id) })),
    booking: row.booking,
  })
}))

router.post('/:id/messages', rateLimit({ key: 'msg', max: 60 }), ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const { content } = z.object({ content: z.string().trim().min(1, 'Tin nhắn trống').max(2000) }).parse(req.body)
  // Kiểm tra thành viên nằm ngay trong câu INSERT (requireMember)
  const { message, members: list } = await chat.addMessage(id, req.user.id, content, 'TEXT', { requireMember: true })
  if (!message) throw new HttpError(403, 'Bạn không thuộc cuộc trò chuyện này')
  remember(id, list)
  // Thông báo cho người nhận đang không mở ứng dụng
  const offline = list.filter((u) => u !== req.user.id && !events.isOnline(u))
  notifySync(offline.map((u) => ({ userId: u, type: 'NEW_MESSAGE', title: `Tin nhắn mới từ ${req.user.name}`, body: content.slice(0, 120), data: { conversationId: id } })))

  // Bác sĩ mô phỏng tự trả lời
  if (req.user.role === 'PATIENT') {
    const other = list.find((u) => u !== req.user.id)
    const doc = directory.byUserId(other)
    if (doc?.isSimulated) require('../lib/bots').scheduleReply(id, doc.userId, message.id, req.user.id)
  }
  res.status(201).json(message)
}))

router.post('/:id/read', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const r = await one(`UPDATE participants SET last_read_at = now() WHERE conversation_id = $1 AND user_id = $2 RETURNING last_read_at`, [id, req.user.id])
  if (!r) throw new HttpError(403, 'Bạn không thuộc cuộc trò chuyện này')
  const others = (members.get(id) || []).filter((u) => u !== req.user.id)
  events.emit(others, 'MESSAGE_READ', { conversationId: id, userId: req.user.id, readAt: r.last_read_at })
  res.json(r)
}))

/** "Đang gõ…" – không ghi DB */
router.post('/:id/typing', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const list = members.get(id)
  if (!list || !list.includes(req.user.id)) return res.json({ ok: false })
  events.emit(list.filter((u) => u !== req.user.id), 'TYPING', { conversationId: id, userId: req.user.id })
  res.json({ ok: true })
}))

module.exports = finalize(router)
