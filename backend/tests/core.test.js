/**
 * Unit test – chạy: cd backend && node --test tests/
 * Không cần DB: kiểm thử các hàm thuần (khoảng cách, matching score, state machine, gợi ý chuyên khoa, mô phỏng).
 */
process.env.MEDIGO_NO_BOOT = '1'
const test = require('node:test')
const assert = require('node:assert/strict')
const { haversineKm, boundingBox } = require('../lib/geo')
const m = require('../lib/matching')
const sm = require('../lib/stateMachine')
const { suggest, normalize } = require('../lib/symptoms')
const sim = require('../lib/simulator')
const { hashPassword, verifyPassword, signJwt, verifyJwt } = require('../lib/auth')

// ───────── Distance Calculation ─────────
test('haversine: 0 km cho cùng một điểm', () => {
  assert.equal(haversineKm(16.06, 108.22, 16.06, 108.22), 0)
})
test('haversine: Cầu Rồng → Ngũ Hành Sơn ≈ 7.3 km (sai số < 3%)', () => {
  const d = haversineKm(16.0612, 108.2272, 16.0038, 108.2635)
  assert.ok(Math.abs(d - 7.4) / 7.4 < 0.03, `d = ${d}`)
})
test('haversine: đối xứng', () => {
  assert.equal(haversineKm(16.0, 108.1, 16.1, 108.2).toFixed(9), haversineKm(16.1, 108.2, 16.0, 108.1).toFixed(9))
})
test('bounding box chứa toàn bộ vòng tròn bán kính r', () => {
  const bb = boundingBox(16.06, 108.22, 5)
  assert.ok(haversineKm(16.06, 108.22, bb.maxLat, 108.22) >= 4.99)
  assert.ok(haversineKm(16.06, 108.22, 16.06, bb.maxLng) >= 4.99)
})

// ───────── Matching Score ─────────
const doc = (over = {}) => ({
  id: 1, lat: 16.06, lng: 108.22, specialtyIds: [2], rating: 4.5, totalReviews: 50, experienceYears: 10,
  status: 'ONLINE', availability: 'AVAILABLE', verified: true, load: 0, capacity: 2, consultationTypes: ['ONLINE', 'IN_PERSON'], ...over,
})
const req = { lat: 16.06, lng: 108.22, specialtyId: 2, relatedSpecialtyIds: [5], consultationType: 'ONLINE', radiusKm: 5 }

test('trọng số mặc định tổng = 1 và chuẩn hóa trọng số tùy ý', () => {
  const sum = Object.values(m.normalizeWeights()).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(sum - 1) < 1e-9)
  const w = m.normalizeWeights({ distance: 2, specialty: 1, availability: 1, rating: 0, experience: 0 })
  assert.equal(w.distance, 0.5)
})
test('weightsWithDistance giữ tổng = 1', () => {
  for (const d of [0.2, 0.4, 0.6]) {
    const w = m.weightsWithDistance(d)
    assert.equal(w.distance, d)
    assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-9)
  }
})
test('điểm tối đa ≈ 1 khi bác sĩ ở ngay vị trí, đúng CK, rảnh, rating & kinh nghiệm cao', () => {
  const { score } = m.scoreDoctor(doc({ rating: 5, totalReviews: 1e6, experienceYears: 30 }), req, m.normalizeWeights(), 0)
  assert.ok(score > 0.99)
})
test('DistanceScore giảm tuyến tính theo khoảng cách', () => {
  const a = m.scoreDoctor(doc(), req, m.normalizeWeights(), 1).components.distance
  const b = m.scoreDoctor(doc(), req, m.normalizeWeights(), 4).components.distance
  assert.equal(a, 0.8)
  assert.ok(Math.abs(b - 0.2) < 1e-9)
})
test('SpecialtyScore: đúng = 1, liên quan = 0.3, khác = 0', () => {
  assert.equal(m.specialtyMatch(doc(), req), 1)
  assert.equal(m.specialtyMatch(doc({ specialtyIds: [5] }), req), 0.3)
  assert.equal(m.specialtyMatch(doc({ specialtyIds: [9] }), req), 0)
})
test('AvailabilityScore giảm theo số ca đang xử lý', () => {
  assert.deepEqual([0, 1, 2].map((l) => m.availabilityScore(doc({ load: l }))), [1, 0.6, 0.3])
})
test('RatingScore Bayesian: 1 review 5★ không vượt 200 review 4.8★', () => {
  assert.ok(m.ratingScore(doc({ rating: 5, totalReviews: 1 })) < m.ratingScore(doc({ rating: 4.8, totalReviews: 200 })))
})

test('rankDoctors loại bác sĩ offline / chưa duyệt / quá bán kính / sai hình thức / quá tải', () => {
  const docs = [
    doc({ id: 1 }),
    doc({ id: 2, status: 'OFFLINE' }),
    doc({ id: 3, verified: false }),
    doc({ id: 4, lat: 16.2 }),
    doc({ id: 5, consultationTypes: ['IN_PERSON'] }),
    doc({ id: 6, load: 2 }),
    doc({ id: 7, availability: 'UNAVAILABLE' }),
  ]
  const r = m.rankDoctors(docs, req, { algorithm: 'multi' })
  assert.deepEqual(r.ranked.map((x) => x.doctorId), [1])
})
test('nearest sắp xếp theo khoảng cách tăng dần', () => {
  const docs = [doc({ id: 1, lat: 16.08 }), doc({ id: 2, lat: 16.061 }), doc({ id: 3, lat: 16.07 })]
  assert.deepEqual(m.rankDoctors(docs, req, { algorithm: 'nearest' }).ranked.map((x) => x.doctorId), [2, 3, 1])
})
test('multi ưu tiên bác sĩ rating cao & rảnh khi khoảng cách tương đương', () => {
  const docs = [doc({ id: 1, rating: 3.6, totalReviews: 100, load: 1 }), doc({ id: 2, rating: 4.9, totalReviews: 100, lat: 16.061 })]
  assert.equal(m.rankDoctors(docs, req, { algorithm: 'multi' }).ranked[0].doctorId, 2)
})
test('multi: đúng chuyên khoa luôn đứng trước chuyên khoa liên quan; liên quan là dự phòng', () => {
  const docs = [doc({ id: 1, specialtyIds: [5] }), doc({ id: 2, lat: 16.09 })]
  const r = m.rankDoctors(docs, req, { algorithm: 'multi' }).ranked
  assert.deepEqual(r.map((x) => x.doctorId), [2, 1])
  assert.deepEqual(m.rankDoctors(docs, req, { algorithm: 'nearest' }).ranked.map((x) => x.doctorId), [2])
})
test('random có seed → tái lập được', () => {
  const { mulberry32 } = require('../lib/seed')
  const docs = Array.from({ length: 30 }, (_, i) => doc({ id: i + 1, lat: 16.06 + i * 0.0005 }))
  const a = m.rankDoctors(docs, req, { algorithm: 'random', rng: mulberry32(7) }).ranked.map((x) => x.doctorId)
  const b = m.rankDoctors(docs, req, { algorithm: 'random', rng: mulberry32(7) }).ranked.map((x) => x.doctorId)
  assert.deepEqual(a, b)
  assert.equal(new Set(a).size, 5)
})
test('Top-K giới hạn số ứng viên', () => {
  const docs = Array.from({ length: 50 }, (_, i) => doc({ id: i + 1 }))
  assert.equal(m.rankDoctors(docs, req, { limit: 5 }).ranked.length, 5)
})

// ───────── Booking state machine ─────────
test('state machine: luồng hợp lệ PENDING → … → COMPLETED', () => {
  const path = ['PENDING', 'SEARCHING', 'OFFERED', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED']
  for (let i = 1; i < path.length; i++) assert.ok(sm.canTransition(path[i - 1], path[i]), `${path[i - 1]}→${path[i]}`)
})
test('state machine: chặn chuyển trạng thái tùy ý', () => {
  assert.equal(sm.canTransition('COMPLETED', 'ACCEPTED'), false)
  assert.equal(sm.canTransition('IN_PROGRESS', 'CANCELLED'), false)
  assert.equal(sm.canTransition('CANCELLED', 'CONFIRMED'), false)
  assert.throws(() => sm.assertTransition('COMPLETED', 'ACCEPTED'), /COMPLETED sang ACCEPTED/)
})
test('state machine: từ chối → quay lại SEARCHING để mời bác sĩ kế tiếp', () => {
  assert.ok(sm.canTransition('OFFERED', 'SEARCHING'))
  assert.ok(sm.canTransition('SEARCHING', 'NO_DOCTOR_FOUND'))
})
test('state machine: trạng thái kết thúc không có lối ra', () => {
  for (const s of sm.TERMINAL) assert.equal(sm.TRANSITIONS[s].length, 0)
  assert.deepEqual(sm.TERMINAL.sort(), ['CANCELLED', 'COMPLETED', 'EXPIRED', 'NO_DOCTOR_FOUND', 'REJECTED'])
})

// ───────── AI gợi ý chuyên khoa ─────────
test('chuẩn hóa tiếng Việt bỏ dấu', () => {
  assert.equal(normalize('Đau họng, SỐT!'), 'dau hong sot')
})
test('"Tôi bị đau họng và sốt" → Tai Mũi Họng', () => {
  assert.equal(suggest('Tôi bị đau họng và sốt').slug, 'tai-mui-hong')
})
test('ngữ cảnh trẻ em → Nhi khoa', () => {
  assert.equal(suggest('Bé nhà tôi 8 tháng tuổi bị sốt và ho').slug, 'nhi-khoa')
})
test('không dấu vẫn nhận diện', () => {
  assert.equal(suggest('dau rang ham duoi').slug, 'rang-ham-mat')
})
test('dấu hiệu nguy hiểm được cảnh báo', () => {
  assert.ok(suggest('đau ngực dữ dội, khó thở').redFlags.length > 0)
})
test('không nhận diện được → Nội khoa (fallback)', () => {
  const r = suggest('xin chào bác sĩ')
  assert.equal(r.slug, 'noi-khoa')
  assert.equal(r.fallback, true)
})

// ───────── Auth ─────────
test('mật khẩu được băm, xác minh đúng/sai', async () => {
  const h = await hashPassword('Demo@123')
  assert.ok(!h.includes('Demo@123'))
  assert.equal(await verifyPassword('Demo@123', h), true)
  assert.equal(await verifyPassword('sai-mat-khau', h), false)
})
test('JWT: hợp lệ, bị sửa → từ chối, hết hạn → từ chối', () => {
  const t = signJwt({ sub: 1, role: 'PATIENT' })
  assert.equal(verifyJwt(t).sub, 1)
  const [h, b, s] = t.split('.')
  const forged = Buffer.from(JSON.stringify({ sub: 1, role: 'ADMIN', exp: 9e9 })).toString('base64url')
  assert.equal(verifyJwt(`${h}.${forged}.${s}`), null)
  assert.equal(verifyJwt(signJwt({ sub: 1 }, -10)), null)
  void b
})

// ───────── Simulator ─────────
test('Gini: phân bố đều = 0, dồn hết cho 1 người ≈ 1', () => {
  assert.equal(sim.gini([3, 3, 3, 3]), 0)
  assert.ok(sim.gini([0, 0, 0, 0, 0, 0, 0, 0, 0, 12]) > 0.85)
})
test('mô phỏng tái lập được với cùng seed', () => {
  const a = sim.run('algorithms', { doctors: 120, requests: 150, repetitions: 1, seed: 9 }).results.rows.map((r) => r.successRate.mean)
  const b = sim.run('algorithms', { doctors: 120, requests: 150, repetitions: 1, seed: 9 }).results.rows.map((r) => r.successRate.mean)
  assert.deepEqual(a, b)
})
test('KPI: matching time < 5 giây với 5.000 bác sĩ', () => {
  const r = sim.run('scale', { doctorCounts: [5000], requests: 200, repetitions: 1 }).results.rows
  for (const row of r) assert.ok(row.matchingMsP95.mean < 5000)
})
