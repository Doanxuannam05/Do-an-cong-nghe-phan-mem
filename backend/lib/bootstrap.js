/**
 * Khởi động hệ thống: chờ DB sẵn sàng → seed dữ liệu mô phỏng (lần đầu) → sinh slot → chạy các worker nền.
 *
 * Worker:
 *  - dispatch sweeper (2s): AUTO REJECT lời mời quá 30s, chuyển bác sĩ kế tiếp
 *  - bots (2s): bác sĩ mô phỏng phản hồi / tiến hành phiên khám
 *  - slots (6h): sinh slot cho 7 ngày tới
 */
const { q } = require('./db')

let readyPromise = null
let workersStarted = false

function ready() {
  if (!readyPromise) {
    readyPromise = init().catch((err) => {
      readyPromise = null
      console.error('[bootstrap] init failed:', err.message)
      throw err
    })
  }
  return readyPromise
}

async function waitForDb() {
  for (let i = 0; i < 60; i++) {
    try {
      await q('SELECT (SELECT 1 FROM users LIMIT 1) AS a, (SELECT 1 FROM app_meta LIMIT 1) AS b')
      return
    } catch {
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
  throw new Error('Database chưa sẵn sàng')
}

async function init() {
  await waitForDb()
  let [{ n, seeded, legacy }] = await q(
    `SELECT (SELECT count(*)::int FROM users) AS n,
            EXISTS (SELECT 1 FROM app_meta WHERE key = 'seeded') AS seeded,
            to_regclass('public.notifications') IS NOT NULL AS legacy`,
  )
  // Dữ liệu tạo bởi phiên bản trước (cờ seed nằm trong bảng notifications cũ)
  if (!seeded && legacy) {
    const [{ ok }] = await q(`SELECT EXISTS (SELECT 1 FROM notifications WHERE type = 'SYSTEM_SEEDED') AS ok`)
    if (ok) {
      await q(`INSERT INTO app_meta (key, value) VALUES ('seeded', '{"legacy": true}'::jsonb) ON CONFLICT DO NOTHING`)
      seeded = true
    }
  }
  if (!seeded) {
    if (n > 0) await resetAll() // lần seed trước bị dở dang
    try {
      await require('./seed').seed()
    } catch (err) {
      console.error('[seed] failed, rolling back:', err.stack)
      await resetAll().catch((e) => console.error('[seed] rollback failed', e.message))
      throw err
    }
  } else {
    await require('./slots').generateSlots({ days: 7 })
  }
  await require('./directory').load()
  startWorkers()
}

/** Xóa toàn bộ dữ liệu theo thứ tự khóa ngoại (dùng khi seed lỗi giữa chừng) */
async function resetAll() {
  const order = ['app_meta', 'api_metrics', 'dispatch_events', 'doctor_locations', 'notifications', 'messages', 'participants', 'conversations', 'experiment_runs', 'complaints', 'payments', 'reviews', 'medical_notes', 'consultations', 'booking_status_logs', 'booking_requests',
    'bookings', 'appointment_slots', 'doctor_schedules', 'doctor_specialties', 'doctors', 'patients', 'refresh_tokens', 'users', 'clinics', 'specialties', 'roles']
  for (const t of order) await q(`DELETE FROM ${t}`)
  console.log('[bootstrap] đã xóa dữ liệu cũ')
}

function loop(name, fn, intervalMs) {
  let running = false
  setInterval(async () => {
    if (running) return
    running = true
    try {
      await fn()
    } catch (e) {
      console.warn(`[worker:${name}]`, e.message)
    } finally {
      running = false
    }
  }, intervalMs).unref?.()
}

function startWorkers() {
  if (workersStarted) return
  workersStarted = true
  const directory = require('./directory')
  const bots = require('./bots')
  bots.recoverySweep().catch((e) => console.warn('[worker:recovery]', e.message))
  loop('recovery', () => bots.recoverySweep(), 45_000)
  // Dọn số đo API cũ hơn 30 ngày (mỗi 6 giờ)
  loop('api-metrics-retention', () => q(`DELETE FROM api_metrics WHERE at < now() - interval '30 days'`), 6 * 3600 * 1000)
  loop('directory', () => directory.load(), 120_000)
  loop('slots', () => require('./slots').generateSlots({ days: 7 }), 6 * 3600 * 1000)
  console.log('[bootstrap] workers started')
}

if (!process.env.MEDIGO_NO_BOOT) setTimeout(() => ready().catch(() => {}), 4000).unref?.()

module.exports = { ready }
