/**
 * Unit test lớp lưu trữ PostgreSQL: ghi theo lô (batch), thông báo, nhật ký điều phối.
 * Phần ghi theo lô dùng writer giả lập (không cần DB). Test cuối ghi/đọc thật nếu có SURF_API_KEY.
 * Chạy: cd backend && node --test tests/storage.test.js
 */
process.env.MEDIGO_NO_BOOT = '1'
const test = require('node:test')
const assert = require('node:assert/strict')
const batch = require('../lib/batch')

function fakeWriter() {
  const calls = []
  let failNext = null
  const fn = async (table, columns, rows) => {
    if (failNext) {
      const e = failNext
      failNext = null
      throw e
    }
    calls.push({ table, rows: rows.map((r) => ({ ...r })) })
  }
  return { fn, calls, fail: (e) => (failNext = e) }
}

test('batch: gom nhiều bản ghi thành MỘT lần ghi mỗi bảng', async () => {
  const w = fakeWriter()
  batch.setWriter(w.fn)
  for (let i = 0; i < 25; i++) batch.enqueue('api_metrics', { route: 'GET /api/x', status: 200, ms: i })
  batch.enqueue('dispatch_events', { booking_id: 1, event: 'OFFERED' })
  await batch.flush()
  assert.equal(w.calls.length, 2)
  assert.equal(w.calls.find((c) => c.table === 'api_metrics').rows.length, 25)
  assert.deepEqual(batch.pending(), { notifications: 0, dispatch_events: 0, doctor_locations: 0, api_metrics: 0 })
})

test('batch: chỉ giữ các cột đã khai báo, Date → ISO string', async () => {
  const w = fakeWriter()
  batch.setWriter(w.fn)
  const at = new Date('2026-10-16T10:00:00Z')
  batch.enqueue('doctor_locations', { doctor_id: 5, latitude: 16.06, longitude: 108.22, source: 'app', recorded_at: at, hacker: 'DROP TABLE' })
  await batch.flush()
  const row = w.calls[0].rows[0]
  assert.equal(row.recorded_at, '2026-10-16T10:00:00.000Z')
  assert.equal('hacker' in row, false)
})

test('batch: lỗi tạm thời (429/mạng) → giữ lại và ghi được ở lần sau', async () => {
  const w = fakeWriter()
  batch.setWriter(w.fn)
  batch.enqueue('dispatch_events', { booking_id: 2, event: 'ACCEPTED' })
  w.fail(new Error('API error 429: rate limit'))
  await batch.flush()
  assert.equal(batch.pending().dispatch_events, 1)
  await batch.flush()
  assert.equal(batch.pending().dispatch_events, 0)
  assert.equal(w.calls.at(-1).rows[0].event, 'ACCEPTED')
})

test('batch: lỗi dữ liệu (vi phạm khóa ngoại) → bỏ lô, không lặp vô hạn', async () => {
  const w = fakeWriter()
  batch.setWriter(w.fn)
  batch.enqueue('dispatch_events', { booking_id: 999999, event: 'OFFERED' })
  w.fail(new Error('insert or update on table "dispatch_events" violates foreign key constraint'))
  await batch.flush()
  assert.equal(batch.pending().dispatch_events, 0)
})

test('batch: từ chối bảng không được khai báo', () => {
  assert.throws(() => batch.enqueue('users', { id: 1 }), /không hỗ trợ/)
})

test('notify: sinh id UUID, đẩy vào hàng đợi thông báo', async () => {
  const w = fakeWriter()
  batch.setWriter(w.fn)
  const { notifySync } = require('../lib/notify')
  const out = notifySync([{ userId: 7, type: 'TEST', title: 'Xin chào', data: { bookingId: 1 } }, { userId: null, title: 'bỏ qua' }])
  assert.equal(out.length, 1)
  assert.match(out[0].id, /^[0-9a-f-]{36}$/)
  await batch.flush()
  assert.equal(w.calls[0].table, 'notifications')
  assert.equal(w.calls[0].rows[0].read_at, null)
})

test('telemetry: tách trường lõi và dữ liệu bổ sung (jsonb)', async () => {
  const w = fakeWriter()
  batch.setWriter(w.fn)
  require('../lib/telemetry').dispatchEvent({ event: 'OFFERED', bookingId: 3, doctorId: 9, rank: 1, score: 88.5, algorithm: 'multi', doctorName: 'BS. A' })
  await batch.flush()
  const r = w.calls[0].rows[0]
  assert.equal(r.booking_id, 3)
  assert.equal(r.score, 88.5)
  assert.deepEqual(r.data, { algorithm: 'multi', doctorName: 'BS. A' })
})

test('PostgreSQL thật: ghi thông báo theo lô rồi đọc lại', { skip: !process.env.SURF_API_KEY && 'Không có kết nối DB' }, async () => {
  const db = require('../lib/db')
  batch.setWriter((table, columns, rows, onConflict) => db.bulkInsert(table, columns, rows, { returning: '', onConflict }))
  const [admin] = await db.q(`SELECT id FROM users WHERE email = 'admin@demo.vn'`)
  const { notifySync } = require('../lib/notify')
  const [n] = notifySync({ userId: admin.id, type: 'TEST', title: 'Kiểm thử lưu trữ PostgreSQL' })
  await batch.flush()
  const rows = await db.q(`SELECT title FROM notifications WHERE id = $1`, [n.id])
  assert.equal(rows[0]?.title, 'Kiểm thử lưu trữ PostgreSQL')
  await db.q(`DELETE FROM notifications WHERE id = $1`, [n.id])
})
