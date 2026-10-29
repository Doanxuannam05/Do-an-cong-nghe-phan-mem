/**
 * Chat Patient ↔ Doctor trên PostgreSQL.
 *   conversations (id = booking_id) · participants (mốc đã đọc) · messages
 * Mỗi thao tác là 1 truy vấn (data-modifying CTE) + đẩy NEW_MESSAGE qua SSE.
 */
const { one } = require('./db')
const events = require('./events')

const present = (m) => ({ id: m.id, conversation_id: m.conversation_id, sender_id: m.sender_id, type: m.type, content: m.content, created_at: m.created_at })

function emitMessage(row) {
  if (!row?.message) return { message: null, members: [] }
  const members = (row.members || []).map(Number)
  const message = present(row.message)
  events.emit(members, 'NEW_MESSAGE', { conversationId: message.conversation_id, message })
  return { message, members }
}

/** Tạo (nếu chưa có) phòng chat cho booking + thêm thành viên + tin nhắn hệ thống – 1 truy vấn */
async function ensureConversation(bookingId, userIds, systemMessage) {
  const ids = [...new Set(userIds.filter(Boolean).map(Number))]
  const row = await one(
    `WITH c AS (INSERT INTO conversations (id, last_message_at, last_message)
                VALUES ($1, now(), CASE WHEN $3::text IS NULL THEN NULL ELSE jsonb_build_object('content', $3::text, 'type', 'SYSTEM', 'sender_id', NULL, 'created_at', now()) END)
                ON CONFLICT (id) DO UPDATE SET last_message_at = COALESCE(EXCLUDED.last_message_at, conversations.last_message_at),
                                               last_message = COALESCE(EXCLUDED.last_message, conversations.last_message)
                RETURNING id),
          p AS (INSERT INTO participants (conversation_id, user_id) SELECT c.id, x::int FROM c, unnest(string_to_array($2, ',')) x WHERE x <> '' ON CONFLICT DO NOTHING),
          m AS (INSERT INTO messages (conversation_id, type, content) SELECT c.id, 'SYSTEM', $3::text FROM c WHERE $3::text IS NOT NULL RETURNING *)
     SELECT (SELECT row_to_json(m) FROM m) AS message,
            (SELECT json_agg(DISTINCT u) FROM (SELECT user_id AS u FROM participants WHERE conversation_id = $1
                                              UNION SELECT x::int FROM unnest(string_to_array($2, ',')) x WHERE x <> '') z) AS members`,
    [Number(bookingId), ids.join(','), systemMessage || null],
  )
  emitMessage(row)
  return Number(bookingId)
}

/** Ghi tin nhắn + cập nhật tin cuối + người gửi đã đọc – 1 truy vấn. senderId = null → tin hệ thống */
async function addMessage(conversationId, senderId, content, type = 'TEXT', { requireMember = false } = {}) {
  const row = await one(
    `WITH ok AS (SELECT 1 WHERE NOT $5::boolean OR EXISTS (SELECT 1 FROM participants WHERE conversation_id = $1::int AND user_id = $2::int)),
          m AS (INSERT INTO messages (conversation_id, sender_id, type, content)
                SELECT $1::int, $2::int, $4::text, $3::text FROM ok WHERE EXISTS (SELECT 1 FROM conversations WHERE id = $1) RETURNING *),
          c AS (UPDATE conversations SET last_message_at = m.created_at,
                  last_message = jsonb_build_object('content', m.content, 'type', m.type, 'sender_id', m.sender_id, 'created_at', m.created_at)
                FROM m WHERE conversations.id = m.conversation_id),
          r AS (UPDATE participants SET last_read_at = now() WHERE conversation_id = $1::int AND user_id = $2::int AND EXISTS (SELECT 1 FROM m))
     SELECT (SELECT row_to_json(m) FROM m) AS message, (SELECT json_agg(user_id) FROM participants WHERE conversation_id = $1) AS members`,
    [Number(conversationId), senderId == null ? null : Number(senderId), content, type, requireMember],
  )
  return emitMessage(row)
}

/** Tin nhắn hệ thống – lỗi chat không làm hỏng luồng chính */
function systemMessage(bookingId, content) {
  return addMessage(bookingId, null, content, 'SYSTEM').catch((e) => console.warn('[chat] system message failed', e.message))
}

module.exports = { ensureConversation, addMessage, systemMessage, present }
