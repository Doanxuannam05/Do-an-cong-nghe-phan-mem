/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MATCHING ENGINE – nội dung nghiên cứu trọng tâm
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * INPUT
 *   request  = { lat, lng, specialtyId, relatedSpecialtyIds[], consultationType, radiusKm }
 *   doctors  = [{ id, lat, lng, specialtyIds[], rating, totalReviews, experienceYears,
 *                 status, availability, verified, load, capacity, consultationTypes[] }]
 *   options  = { algorithm: 'random' | 'nearest' | 'multi', weights, limit, rng }
 *
 * PROCESSING
 *   1. Lọc điều kiện cứng (eligibility):
 *        status = ONLINE ∧ availability = AVAILABLE ∧ verified ∧ load < capacity
 *        ∧ khoảng cách ≤ radiusKm ∧ hỗ trợ hình thức khám yêu cầu
 *   2. Theo thuật toán:
 *        random  – chọn ngẫu nhiên trong tập bác sĩ đúng chuyên khoa       (baseline 1)
 *        nearest – sắp xếp tăng dần theo khoảng cách, đúng chuyên khoa      (baseline 2)
 *        multi   – tính Matching Score đa tiêu chí rồi sắp xếp giảm dần     (đề xuất)
 *
 *   Matching Score (mặc định):
 *     Score = 0.40·Distance + 0.25·Specialty + 0.15·Availability + 0.10·Rating + 0.10·Experience
 *       DistanceScore     = max(0, 1 − d / R)                 (R = bán kính tìm kiếm)
 *       SpecialtyScore    = 1 (đúng chuyên khoa) | 0.3 (chuyên khoa liên quan) | loại (khác)
 *       AvailabilityScore = 1 / 0.6 / 0.3 khi bác sĩ đang có 0 / 1 / ≥2 ca đang xử lý
 *       RatingScore       = Bayesian average: (n·r + k·C) / (n + k) / 5,  C = 4.0, k = 5
 *                           → tránh bác sĩ chỉ có 1 review 5★ vượt bác sĩ có 200 review 4.8★
 *       ExperienceScore   = min(1, năm kinh nghiệm / 20)
 *     Trọng số có thể thay đổi (được chuẩn hóa để tổng = 1) phục vụ thí nghiệm 2.
 *
 * OUTPUT
 *   Danh sách Top-K bác sĩ: { doctorId, distanceKm, score (0–100), components{...}, rank }
 *
 * COMPLEXITY
 *   n = số bác sĩ trong bounding box. Lọc + tính điểm O(n), sắp xếp O(n log n), bộ nhớ O(n).
 *   Với index (lat,lng) ở DB, n chỉ là số bác sĩ quanh bệnh nhân chứ không phải toàn hệ thống.
 *
 * ƯU ĐIỂM
 *   - Cân bằng giữa khoảng cách, chất lượng và khả năng phục vụ; giải thích được (explainable).
 *   - Xếp hạng theo tầng: đúng chuyên khoa trước, chuyên khoa liên quan làm dự phòng trong Top-K.
 *   - Phân tải: bác sĩ đang nhiều ca bị giảm điểm → giảm tỷ lệ từ chối.
 * NHƯỢC ĐIỂM
 *   - Trọng số chọn thủ công, cần thực nghiệm để hiệu chỉnh.
 *   - Khoảng cách đường chim bay, chưa tính thời gian di chuyển thực tế.
 *
 * ĐÁNH GIÁ
 *   Xem lib/simulator.js: Matching Time, Average Distance, Acceptance Rate, Success Rate,
 *   User Satisfaction – so sánh với random và nearest.
 */
const { haversineKm } = require('./geo')

const DEFAULT_WEIGHTS = Object.freeze({ distance: 0.4, specialty: 0.25, availability: 0.15, rating: 0.1, experience: 0.1 })
const ALGORITHMS = ['random', 'nearest', 'multi']
const RATING_PRIOR = 4.0
const RATING_PRIOR_WEIGHT = 5

function normalizeWeights(w = {}) {
  const merged = { ...DEFAULT_WEIGHTS, ...Object.fromEntries(Object.entries(w).filter(([, v]) => Number.isFinite(Number(v)))) }
  const keys = Object.keys(DEFAULT_WEIGHTS)
  const sum = keys.reduce((s, k) => s + Math.max(0, Number(merged[k])), 0) || 1
  return Object.fromEntries(keys.map((k) => [k, Math.max(0, Number(merged[k])) / sum]))
}

/** Đặt trọng số khoảng cách = d, các trọng số còn lại co giãn theo tỉ lệ mặc định (thí nghiệm 2) */
function weightsWithDistance(d) {
  const rest = 1 - d
  const others = { ...DEFAULT_WEIGHTS }
  delete others.distance
  const sum = Object.values(others).reduce((a, b) => a + b, 0)
  return { distance: d, ...Object.fromEntries(Object.entries(others).map(([k, v]) => [k, (v / sum) * rest])) }
}

function specialtyMatch(doctor, request) {
  if (!request.specialtyId) return 1
  if (doctor.specialtyIds.includes(request.specialtyId)) return 1
  if (request.relatedSpecialtyIds && doctor.specialtyIds.some((id) => request.relatedSpecialtyIds.includes(id))) return 0.3
  return 0
}

function availabilityScore(doctor) {
  const load = doctor.load || 0
  if (load <= 0) return 1
  if (load === 1) return 0.6
  return 0.3
}

function ratingScore(doctor) {
  const n = doctor.totalReviews || 0
  const r = doctor.rating || 0
  return (n * r + RATING_PRIOR_WEIGHT * RATING_PRIOR) / (n + RATING_PRIOR_WEIGHT) / 5
}

const experienceScore = (doctor) => Math.min(1, (doctor.experienceYears || 0) / 20)

/** Tính điểm thành phần cho một bác sĩ */
function scoreDoctor(doctor, request, weights, distanceKm) {
  const components = {
    distance: Math.max(0, 1 - distanceKm / request.radiusKm),
    specialty: specialtyMatch(doctor, request),
    availability: availabilityScore(doctor),
    rating: ratingScore(doctor),
    experience: experienceScore(doctor),
  }
  const score = Object.keys(weights).reduce((s, k) => s + weights[k] * components[k], 0)
  return { score, components }
}

function isEligible(doctor, request) {
  if (doctor.status !== 'ONLINE' || doctor.availability !== 'AVAILABLE' || !doctor.verified) return false
  if ((doctor.load || 0) >= (doctor.capacity || 2)) return false
  if (request.consultationType && doctor.consultationTypes && !doctor.consultationTypes.includes(request.consultationType)) return false
  return true
}

/**
 * Xếp hạng bác sĩ cho một yêu cầu.
 * @returns {{ ranked: Array, eligibleCount: number, elapsedMs: number }}
 */
function rankDoctors(doctors, request, { algorithm = 'multi', weights, limit = 5, rng = Math.random } = {}) {
  const t0 = process.hrtime.bigint()
  const w = normalizeWeights(weights)
  const pool = []

  // Bước 1: lọc điều kiện cứng + tính khoảng cách (O(n))
  for (const d of doctors) {
    if (!isEligible(d, request)) continue
    const distanceKm = d.distanceKm ?? haversineKm(request.lat, request.lng, d.lat, d.lng)
    if (distanceKm > request.radiusKm) continue
    const spec = specialtyMatch(d, request)
    // Baseline chỉ nhận đúng chuyên khoa; multi chấp nhận chuyên khoa liên quan (spec = 0.3)
    if (algorithm === 'multi' ? spec === 0 : spec < 1) continue
    pool.push({ d, distanceKm })
  }

  // Bước 1b (multi): xếp hạng theo TẦNG – bác sĩ đúng chuyên khoa luôn đứng trước, bác sĩ chuyên khoa
  // liên quan (SpecialtyScore = 0.3) chỉ lấp các vị trí còn trống trong Top-K làm phương án dự phòng
  // khi các bác sĩ đúng chuyên khoa từ chối / không phản hồi.

  // Bước 2: xếp hạng theo thuật toán
  let ranked
  if (algorithm === 'random') {
    // Fisher–Yates shuffle một phần: O(k)
    const arr = pool.slice()
    const k = Math.min(limit, arr.length)
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(rng() * (arr.length - i))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    ranked = arr.slice(0, k).map((x) => ({ ...x, ...scoreDoctor(x.d, request, w, x.distanceKm) }))
  } else if (algorithm === 'nearest') {
    ranked = pool
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit)
      .map((x) => ({ ...x, ...scoreDoctor(x.d, request, w, x.distanceKm) }))
  } else {
    ranked = pool
      .map((x) => ({ ...x, ...scoreDoctor(x.d, request, w, x.distanceKm) }))
      .sort((a, b) => (b.components.specialty === 1) - (a.components.specialty === 1) || b.score - a.score || a.distanceKm - b.distanceKm)
      .slice(0, limit)
  }

  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6
  return {
    eligibleCount: pool.length,
    elapsedMs,
    weights: w,
    ranked: ranked.map((x, i) => ({
      rank: i + 1,
      doctorId: x.d.id,
      distanceKm: round(x.distanceKm, 3),
      score: round(x.score * 100, 1),
      components: Object.fromEntries(Object.entries(x.components).map(([k, v]) => [k, round(v, 3)])),
    })),
  }
}

const round = (v, p = 2) => Math.round(v * 10 ** p) / 10 ** p

module.exports = { rankDoctors, scoreDoctor, normalizeWeights, weightsWithDistance, isEligible, DEFAULT_WEIGHTS, ALGORITHMS, ratingScore, availabilityScore, experienceScore, specialtyMatch }
