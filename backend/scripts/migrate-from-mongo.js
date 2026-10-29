/**
 * Chép dữ liệu MongoDB → PostgreSQL (chạy MỘT lần khi bỏ MongoDB).
 *   conversations / messages / notifications / doctor_locations / dispatch_events / experiment_runs / api_metrics
 * Idempotent: ON CONFLICT DO NOTHING + cờ 'mongo_imported' trong app_meta.
 *
 * Đã chạy một lần khi bỏ MongoDB (kết quả lưu trong app_meta.mongo_imported). Muốn chạy lại cần cài tạm gói mongodb.
 */
process.env.MEDIGO_NO_BOOT = '1'
const { MongoClient } = require('mongodb')
const { q, bulkInsert } = require('../lib/db')

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const DB = process.env.MONGODB_DB || 'medigo'
const iso = (d) => (d ? new Date(d).toISOString() : null)

;(async () => {
  const done = await q(`SELECT 1 FROM app_meta WHERE key = 'mongo_imported'`)
  if (done.length) return console.log('Đã chuyển trước đó – bỏ qua.')
  const client = await MongoClient.connect(URI, { serverSelectionTimeoutMS: 5000 })
  const db = client.db(DB)
  const report = {}

  // Chỉ chép phòng chat của booking còn tồn tại (khóa ngoại)
  const bookingIds = new Set((await q(`SELECT id FROM bookings`)).map((r) => r.id))
  const userIds = new Set((await q(`SELECT id FROM users`)).map((r) => r.id))
  const doctorIds = new Set((await q(`SELECT id FROM doctors`)).map((r) => r.id))

  const convs = (await db.collection('conversations').find().toArray()).filter((c) => bookingIds.has(c._id))
  await bulkInsert('conversations', { id: 'int', created_at: 'timestamptz', last_message_at: 'timestamptz', last_message: 'jsonb' },
    convs.map((c) => ({
      id: c._id, created_at: iso(c.createdAt), last_message_at: iso(c.lastMessageAt),
      last_message: c.lastMessage ? { content: c.lastMessage.content, type: c.lastMessage.type, sender_id: c.lastMessage.senderId, created_at: iso(c.lastMessage.createdAt) } : null,
    })), { returning: '', onConflict: 'ON CONFLICT (id) DO NOTHING' })
  await bulkInsert('participants', { conversation_id: 'int', user_id: 'int', last_read_at: 'timestamptz' },
    convs.flatMap((c) => c.participants.filter((p) => userIds.has(p.userId)).map((p) => ({ conversation_id: c._id, user_id: p.userId, last_read_at: iso(p.lastReadAt) }))),
    { returning: '', onConflict: 'ON CONFLICT DO NOTHING' })
  const convSet = new Set(convs.map((c) => c._id))
  const msgs = (await db.collection('messages').find().sort({ createdAt: 1 }).toArray()).filter((m) => convSet.has(m.conversationId))
  await bulkInsert('messages', { conversation_id: 'int', sender_id: 'int', type: 'text', content: 'text', created_at: 'timestamptz' },
    msgs.map((m) => ({ conversation_id: m.conversationId, sender_id: m.senderId != null && userIds.has(m.senderId) ? m.senderId : null, type: m.type, content: m.content, created_at: iso(m.createdAt) })), { returning: '' })
  report.conversations = convs.length
  report.messages = msgs.length

  const notes = (await db.collection('notifications').find().toArray()).filter((n) => userIds.has(n.userId))
  await bulkInsert('notifications', { id: 'text', user_id: 'int', type: 'text', title: 'text', body: 'text', data: 'jsonb', read_at: 'timestamptz', created_at: 'timestamptz' },
    notes.map((n) => ({ id: n._id.toHexString(), user_id: n.userId, type: n.type, title: n.title, body: n.body, data: n.data, read_at: iso(n.readAt), created_at: iso(n.createdAt) })),
    { returning: '', onConflict: 'ON CONFLICT (id) DO NOTHING' })
  report.notifications = notes.length

  const locs = (await db.collection('doctor_locations').find().toArray()).filter((l) => doctorIds.has(l.doctorId))
  await bulkInsert('doctor_locations', { doctor_id: 'int', latitude: 'float8', longitude: 'float8', source: 'text', recorded_at: 'timestamptz' },
    locs.map((l) => ({ doctor_id: l.doctorId, latitude: l.location.coordinates[1], longitude: l.location.coordinates[0], source: l.source, recorded_at: iso(l.at) })), { returning: '' })
  report.doctorLocations = locs.length

  const CORE = ['_id', 'event', 'bookingId', 'doctorId', 'rank', 'score', 'distanceKm', 'responseMs', 'at']
  const evs = (await db.collection('dispatch_events').find().toArray()).filter((e) => bookingIds.has(e.bookingId))
  await bulkInsert('dispatch_events', { booking_id: 'int', event: 'text', doctor_id: 'int', rank: 'int', score: 'real', distance_km: 'real', response_ms: 'int', data: 'jsonb', at: 'timestamptz' },
    evs.map((e) => ({
      booking_id: e.bookingId, event: e.event, doctor_id: e.doctorId ?? null, rank: e.rank ?? null, score: e.score ?? null, distance_km: e.distanceKm ?? null,
      response_ms: e.responseMs ?? null, data: Object.fromEntries(Object.entries(e).filter(([k]) => !CORE.includes(k))), at: iso(e.at),
    })), { returning: '' })
  report.dispatchEvents = evs.length

  const runs = await db.collection('experiment_runs').find().toArray()
  await bulkInsert('experiment_runs', { id: 'int', experiment: 'text', params: 'jsonb', results: 'jsonb', duration_ms: 'int', created_by: 'int', created_at: 'timestamptz' },
    runs.map((r) => ({ id: r._id, experiment: r.experiment, params: r.params, results: r.results, duration_ms: r.durationMs, created_by: r.createdBy, created_at: iso(r.createdAt) })),
    { returning: '', onConflict: 'ON CONFLICT (id) DO NOTHING' })
  if (runs.length) await q(`SELECT setval(pg_get_serial_sequence('experiment_runs', 'id'), (SELECT max(id) FROM experiment_runs))`)
  report.experimentRuns = runs.length

  const metrics = await db.collection('api_metrics').find().toArray()
  await bulkInsert('api_metrics', { route: 'text', status: 'int', ms: 'int', role: 'text', at: 'timestamptz' },
    metrics.map((m) => ({ route: m.route, status: m.status, ms: m.ms, role: m.role, at: iso(m.at) })), { returning: '' })
  report.apiMetrics = metrics.length

  await q(`INSERT INTO app_meta (key, value) VALUES ('mongo_imported', $1::jsonb) ON CONFLICT (key) DO NOTHING`, [JSON.stringify({ at: new Date(), ...report })])
  await q(`DELETE FROM app_meta WHERE key = 'mongo_migrated'`)
  console.log('Hoàn tất:', JSON.stringify(report))
  await client.close()
})().catch((e) => {
  console.error('Lỗi:', e.message)
  process.exit(1)
})
