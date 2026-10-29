/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BỘ MÔ PHỎNG THỰC NGHIỆM (Discrete-event simulation)
 * ═══════════════════════════════════════════════════════════════════════════
 * Dùng CHÍNH Matching Engine của hệ thống (lib/matching.js) để so sánh 3 thuật toán
 * trên cùng một kịch bản (cùng seed) → so sánh công bằng, tái lập được.
 *
 * Kịch bản:
 *   - N bác sĩ trong khu vực Đà Nẵng (70% tập trung quanh 12 cụm phòng khám, 30% phân bố đều).
 *   - M yêu cầu khám ngay đến theo thời gian trong cửa sổ T phút (phân bố đều ~ quá trình Poisson).
 *   - Mỗi bác sĩ có chất lượng thật q ∈ [3.4, 5]; rating quan sát = q + nhiễu giảm theo số review.
 *
 * Mô hình hành vi (GIẢ ĐỊNH – trình bày rõ trong báo cáo):
 *   P(accept) = r_i × f_dist(d) × f_load(load)
 *     r_i      : độ sẵn lòng nhận ca của bác sĩ, tương quan một phần với chất lượng (tham số ρ)
 *     f_dist   : exp(−d/8) nếu khám trực tiếp, exp(−d/25) nếu khám online
 *     f_load   : 1 / 0.7 / 0.4 khi đang có 0 / 1 / 2 ca
 *   10% lời mời không được phản hồi → timeout 30s (AUTO REJECT).
 *   Người bệnh bỏ cuộc nếu tổng thời gian chờ > 150s.
 *   Ca khám kéo dài 20–40 phút (online) hoặc 30–60 phút + thời gian di chuyển (trực tiếp).
 *
 * Độ hài lòng (1–5) cho ca thành công:
 *   S = 1 + 4 × (0.35·q̂ + 0.25·spec + 0.20·distScore + 0.20·waitScore)
 *   q̂ = (q−1)/4, spec = 1 (đúng CK) | 0.5 (CK liên quan), waitScore = max(0, 1 − wait/150)
 */
const { rankDoctors, normalizeWeights, weightsWithDistance, ALGORITHMS } = require('./matching')
const { haversineKm } = require('./geo')
const { mulberry32, SPECIALTIES } = require('./seed')

const BBOX = { minLat: 15.985, maxLat: 16.095, minLng: 108.145, maxLng: 108.255 }
const CENTERS = [
  [16.0702, 108.2176], [16.0645, 108.2241], [16.0563, 108.2105], [16.0662, 108.1912], [16.0571, 108.1838], [16.0726, 108.2369],
  [16.0758, 108.2442], [16.0381, 108.2453], [16.0129, 108.2541], [16.0708, 108.1532], [16.0228, 108.2152], [16.0298, 108.2036],
]
// Tần suất yêu cầu theo chuyên khoa (giả định): Nội khoa, Nhi, TMH phổ biến hơn
const SPEC_WEIGHTS = { 'tim-mach': 0.08, 'tai-mui-hong': 0.15, 'da-lieu': 0.1, 'nhi-khoa': 0.15, 'noi-khoa': 0.2, 'ngoai-khoa': 0.06, 'san-khoa': 0.06, 'rang-ham-mat': 0.08, mat: 0.06, 'than-kinh': 0.06 }
const SPEC_IDS = Object.fromEntries(SPECIALTIES.map((s, i) => [s.slug, i + 1]))
const RELATED = Object.fromEntries(SPECIALTIES.map((s, i) => [i + 1, s.related.map((r) => SPEC_IDS[r])]))

const TIMEOUT_SEC = 30
const PATIENCE_SEC = 150
const TOP_K = 5

function gauss(rng) {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
function randomPoint(rng, clustered) {
  if (clustered) {
    const [lat, lng] = CENTERS[Math.floor(rng() * CENTERS.length)]
    return { lat: lat + (gauss(rng) * 1.2) / 111.32, lng: lng + (gauss(rng) * 1.2) / 107 }
  }
  return { lat: BBOX.minLat + rng() * (BBOX.maxLat - BBOX.minLat), lng: BBOX.minLng + rng() * (BBOX.maxLng - BBOX.minLng) }
}
function pickWeighted(rng, weights) {
  let r = rng()
  for (const [k, w] of Object.entries(weights)) {
    r -= w
    if (r <= 0) return k
  }
  return Object.keys(weights)[0]
}

/** Sinh kịch bản (bác sĩ + yêu cầu) từ seed */
function generateScenario({ doctors = 500, requests = 1000, onlineRate = 0.7, windowMin = 240, rho = 0.5, seed = 42 }) {
  const rng = mulberry32(seed)
  const docs = []
  for (let i = 0; i < doctors; i++) {
    const p = randomPoint(rng, rng() < 0.7)
    const q = 3.4 + rng() * 1.6
    const n = Math.floor(-Math.log(1 - rng()) * 25)
    const observed = clamp(q + (gauss(rng) * 0.6) / Math.sqrt(n + 1), 1, 5)
    const t = rng()
    const online = rng() < onlineRate
    const specId = 1 + (i % 10)
    docs.push({
      id: i + 1, lat: p.lat, lng: p.lng, specialtyIds: rng() < 0.12 && specId !== 5 ? [specId, 5] : [specId],
      quality: q, rating: Math.round(observed * 100) / 100, totalReviews: n, experienceYears: 1 + Math.floor(rng() * 30),
      status: online ? 'ONLINE' : 'OFFLINE', availability: online && rng() < 0.9 ? 'AVAILABLE' : 'UNAVAILABLE', verified: true,
      consultationTypes: t < 0.7 ? ['ONLINE', 'IN_PERSON'] : t < 0.85 ? ['ONLINE'] : ['IN_PERSON'],
      responsiveness: clamp(rho * (0.5 + (0.4 * (q - 3.4)) / 1.6) + (1 - rho) * (0.55 + rng() * 0.4) + (rng() - 0.5) * 0.1, 0.3, 0.97),
      load: 0, capacity: 2,
    })
  }
  const reqs = []
  for (let j = 0; j < requests; j++) {
    const p = randomPoint(rng, rng() < 0.8)
    const slug = pickWeighted(rng, SPEC_WEIGHTS)
    reqs.push({ id: j + 1, t: rng() * windowMin * 60, lat: p.lat, lng: p.lng, specialtyId: SPEC_IDS[slug], consultationType: rng() < 0.5 ? 'ONLINE' : 'IN_PERSON' })
  }
  reqs.sort((a, b) => a.t - b.t)
  return { docs, reqs, seed }
}

/** Chỉ mục lưới (grid) ~1 km – tương đương spatial index, giảm số bác sĩ phải xét */
function buildGrid(docs, cellKm = 1) {
  const cLat = cellKm / 111.32
  const cLng = cellKm / 107
  const grid = new Map()
  for (const d of docs) {
    const k = `${Math.floor(d.lat / cLat)}:${Math.floor(d.lng / cLng)}`
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(d)
  }
  return {
    query(lat, lng, radiusKm) {
      const r = Math.ceil(radiusKm / cellKm)
      const ci = Math.floor(lat / cLat)
      const cj = Math.floor(lng / cLng)
      const out = []
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
        const cell = grid.get(`${i}:${j}`)
        if (cell) out.push(...cell)
      }
      return out
    },
  }
}

/**
 * Chạy mô phỏng cho một thuật toán trên một kịch bản.
 * Trạng thái bác sĩ (load) thay đổi theo thời gian → phản ánh hiệu ứng "dồn tải" của Nearest.
 */
function simulate(scenario, { algorithm, weights, radiusKm = 5, measureFullScan = false }) {
  const rng = mulberry32(scenario.seed * 7919 + ALGORITHMS.indexOf(algorithm) + 1)
  const docs = scenario.docs.map((d) => ({ ...d, load: 0, busyUntil: [] }))
  const grid = buildGrid(docs)
  const assignments = new Map()
  const m = { requests: 0, success: 0, offers: 0, accepted: 0, timeouts: 0, abandoned: 0, noCandidate: 0, distSum: 0, waitSum: 0, satSum: 0, satAllSum: 0, exactSpec: 0, matchMs: [], retrievalMs: 0, fullScanMs: 0, candidatesSum: 0 }

  for (const req of scenario.reqs) {
    m.requests++
    // giải phóng bác sĩ đã xong ca
    const now = req.t
    // (chỉ cập nhật những bác sĩ có ca – O(số ca đang mở))
    for (const d of docs) if (d.busyUntil.length) {
      d.busyUntil = d.busyUntil.filter((t) => t > now)
      d.load = d.busyUntil.length
    }

    const t0 = process.hrtime.bigint()
    const cand = grid.query(req.lat, req.lng, radiusKm)
    const t1 = process.hrtime.bigint()
    if (measureFullScan) {
      const ts = process.hrtime.bigint()
      let c = 0
      for (const d of docs) if (haversineKm(req.lat, req.lng, d.lat, d.lng) <= radiusKm) c++
      m.fullScanMs += Number(process.hrtime.bigint() - ts) / 1e6
      m.fullScanCount = c
    }
    const result = rankDoctors(cand, { ...req, radiusKm, relatedSpecialtyIds: RELATED[req.specialtyId] }, { algorithm, weights, limit: TOP_K, rng })
    const elapsed = Number(process.hrtime.bigint() - t0) / 1e6
    m.retrievalMs += Number(t1 - t0) / 1e6
    m.matchMs.push(elapsed)
    m.candidatesSum += cand.length

    if (!result.ranked.length) {
      m.noCandidate++
      m.satAllSum += 1
      continue
    }
    // Dispatch tuần tự qua danh sách
    let wait = 0
    let chosen = null
    for (const c of result.ranked) {
      if (wait > PATIENCE_SEC) break
      const d = docs[c.doctorId - 1]
      m.offers++
      if (rng() < 0.1) {
        wait += TIMEOUT_SEC
        m.timeouts++
        continue
      }
      const fDist = Math.exp(-c.distanceKm / (req.consultationType === 'IN_PERSON' ? 8 : 25))
      const fLoad = [1, 0.7, 0.4][Math.min(2, d.load)]
      if (rng() < d.responsiveness * fDist * fLoad) {
        wait += 3 + rng() * 9
        m.accepted++
        chosen = { d, c }
        break
      }
      wait += 2 + rng() * 6
    }
    if (!chosen || wait > PATIENCE_SEC) {
      m.abandoned++
      m.satAllSum += 1
      continue
    }
    m.success++
    const { d, c } = chosen
    const dur = req.consultationType === 'ONLINE' ? 20 + rng() * 20 : 30 + rng() * 30 + c.distanceKm * 3
    d.busyUntil.push(now + wait + dur * 60)
    d.load = d.busyUntil.length
    assignments.set(d.id, (assignments.get(d.id) || 0) + 1)
    const exact = d.specialtyIds.includes(req.specialtyId)
    if (exact) m.exactSpec++
    const distScore = req.consultationType === 'IN_PERSON' ? Math.max(0, 1 - c.distanceKm / 10) : Math.max(0, 1 - c.distanceKm / 30)
    const sat = 1 + 4 * (0.35 * ((d.quality - 1) / 4) + 0.25 * (exact ? 1 : 0.5) + 0.2 * distScore + 0.2 * Math.max(0, 1 - wait / PATIENCE_SEC))
    m.distSum += c.distanceKm
    m.waitSum += wait
    m.satSum += sat
    m.satAllSum += sat
  }

  const sorted = m.matchMs.slice().sort((a, b) => a - b)
  return {
    algorithm,
    requests: m.requests,
    successRate: m.success / m.requests,
    acceptanceRate: m.offers ? m.accepted / m.offers : 0,
    avgDistanceKm: m.success ? m.distSum / m.success : null,
    avgWaitSec: m.success ? m.waitSum / m.success : null,
    satisfaction: m.success ? m.satSum / m.success : null,
    satisfactionAll: m.satAllSum / m.requests,
    offersPerRequest: m.offers / m.requests,
    timeoutRate: m.offers ? m.timeouts / m.offers : 0,
    noCandidateRate: m.noCandidate / m.requests,
    exactSpecialtyRate: m.success ? m.exactSpec / m.success : null,
    loadGini: gini(scenario.docs.map((d) => assignments.get(d.id) || 0).filter((_, i) => scenario.docs[i].status === 'ONLINE')),
    matchingMsAvg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    matchingMsP95: sorted[Math.floor(sorted.length * 0.95)] || 0,
    retrievalMsAvg: m.retrievalMs / m.requests,
    fullScanMsAvg: measureFullScan ? m.fullScanMs / m.requests : null,
    avgCandidates: m.candidatesSum / m.requests,
  }
}

/** Hệ số Gini của số ca được giao – thấp = phân tải đều */
function gini(arr) {
  const a = arr.slice().sort((x, y) => x - y)
  const n = a.length
  const sum = a.reduce((s, x) => s + x, 0)
  if (!n || !sum) return 0
  let cum = 0
  for (let i = 0; i < n; i++) cum += (i + 1) * a[i]
  return (2 * cum) / (n * sum) - (n + 1) / n
}

const METRICS = ['successRate', 'acceptanceRate', 'avgDistanceKm', 'avgWaitSec', 'satisfaction', 'satisfactionAll', 'offersPerRequest', 'timeoutRate', 'exactSpecialtyRate', 'loadGini', 'matchingMsAvg', 'matchingMsP95', 'retrievalMsAvg', 'fullScanMsAvg', 'avgCandidates']

/** Gộp kết quả nhiều lần lặp: trung bình ± độ lệch chuẩn */
function aggregate(runs) {
  const out = { algorithm: runs[0].algorithm, runs: runs.length }
  for (const k of METRICS) {
    const vals = runs.map((r) => r[k]).filter((v) => v != null && Number.isFinite(v))
    if (!vals.length) {
      out[k] = null
      continue
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length - 1))
    out[k] = { mean: round(mean), sd: round(sd) }
  }
  return out
}
const round = (v) => Math.round(v * 10000) / 10000

function runRepeated(base, algoOpts, repetitions) {
  const runs = []
  for (let r = 0; r < repetitions; r++) {
    const scenario = generateScenario({ ...base, seed: base.seed + r * 101 })
    runs.push(simulate(scenario, algoOpts))
  }
  return aggregate(runs)
}

/** Thí nghiệm 1: Random vs Nearest vs Multi-Criteria */
function experimentAlgorithms(p) {
  return {
    rows: ALGORITHMS.map((algorithm) => runRepeated(p, { algorithm, weights: p.weights, radiusKm: p.radiusKm }, p.repetitions)),
  }
}

/** Thí nghiệm 2: thay đổi trọng số khoảng cách (20% / 40% / 60% …) */
function experimentWeights(p) {
  const list = p.distanceWeights?.length ? p.distanceWeights : [0.2, 0.4, 0.6]
  const rows = list.map((dw) => {
    const w = weightsWithDistance(dw)
    return { distanceWeight: dw, weights: normalizeWeights(w), ...runRepeated(p, { algorithm: 'multi', weights: w, radiusKm: p.radiusKm }, p.repetitions) }
  })
  const baseline = runRepeated(p, { algorithm: 'nearest', radiusKm: p.radiusKm }, p.repetitions)
  return { rows, baseline }
}

/** Thí nghiệm 3: khả năng mở rộng theo số bác sĩ (100 / 500 / 1.000 / 5.000) */
function experimentScale(p) {
  const sizes = p.doctorCounts?.length ? p.doctorCounts : [100, 500, 1000, 5000]
  const rows = []
  for (const n of sizes) {
    for (const algorithm of ALGORITHMS) {
      const agg = []
      for (let r = 0; r < p.repetitions; r++) {
        const sc = generateScenario({ ...p, doctors: n, seed: p.seed + r * 101 })
        agg.push(simulate(sc, { algorithm, weights: p.weights, radiusKm: p.radiusKm, measureFullScan: algorithm === 'multi' }))
      }
      rows.push({ doctors: n, ...aggregate(agg) })
    }
  }
  return { rows }
}

const EXPERIMENTS = { algorithms: experimentAlgorithms, weights: experimentWeights, scale: experimentScale }

function run(experiment, params) {
  const p = {
    doctors: 500, requests: 1000, radiusKm: 5, onlineRate: 0.7, windowMin: 240, rho: 0.5, repetitions: 3, seed: 42,
    ...params,
  }
  const t0 = Date.now()
  const results = EXPERIMENTS[experiment](p)
  return { experiment, params: p, results, durationMs: Date.now() - t0 }
}

module.exports = { run, generateScenario, simulate, gini, EXPERIMENTS }
