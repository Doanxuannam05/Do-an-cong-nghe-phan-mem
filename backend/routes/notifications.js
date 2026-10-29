/** /api/notifications – thông báo in-app (PostgreSQL, ghi theo lô) */
const { z } = require('zod')
const { createRouter, finalize, ah } = require('../lib/http')
const { q, one } = require('../lib/db')
const { requireAuth } = require('../lib/auth')
const batch = require('../lib/batch')

const router = createRouter()
router.use(requireAuth)

router.get('/', ah(async (req, res) => {
  // Ghi nốt các thông báo đang chờ trong lô để danh sách luôn đầy đủ
  if (batch.pending().notifications) await batch.flush()
  const row = await one(
    `SELECT (SELECT json_agg(n ORDER BY n.created_at DESC) FROM (SELECT id, type, title, body, data, read_at, created_at FROM notifications
              WHERE user_id = $1 ORDER BY created_at DESC LIMIT 40) n) AS items,
            (SELECT count(*)::int FROM notifications WHERE user_id = $1 AND read_at IS NULL) AS unread`,
    [req.user.id],
  )
  res.json({ items: row.items || [], unread: row.unread })
}))

router.post('/read-all', ah(async (req, res) => {
  await batch.flush()
  await q(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [req.user.id])
  res.json({ ok: true })
}))

router.post('/:id/read', ah(async (req, res) => {
  const id = z.string().min(8).max(64).parse(req.params.id)
  if (batch.pending().notifications) await batch.flush()
  await q(`UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2`, [id, req.user.id])
  res.json({ ok: true })
}))

module.exports = finalize(router)
