/**
 * /api/experiments – chạy thực nghiệm so sánh thuật toán (ADMIN / nhóm nghiên cứu).
 *   algorithms : Random vs Nearest vs Multi-Criteria
 *   weights    : thay đổi trọng số khoảng cách 20% / 40% / 60%
 *   scale      : số bác sĩ 100 / 500 / 1.000 / 5.000
 * Kết quả lưu vào bảng experiment_runs (PostgreSQL) kèm tham số + seed → tái lập được.
 */
const { z } = require('zod')
const { createRouter, finalize, ah, HttpError, rateLimit } = require('../lib/http')
const { q, one } = require('../lib/db')
const { requireAuth, requireRole } = require('../lib/auth')
const simulator = require('../lib/simulator')

const router = createRouter()
router.use(requireAuth, requireRole('ADMIN'))

const weights = z.object({ distance: z.number(), specialty: z.number(), availability: z.number(), rating: z.number(), experience: z.number() }).partial().optional()
const schema = z.object({
  experiment: z.enum(['algorithms', 'weights', 'scale']),
  params: z.object({
    doctors: z.coerce.number().int().min(20).max(5000).optional(),
    requests: z.coerce.number().int().min(50).max(3000).optional(),
    radiusKm: z.coerce.number().min(1).max(20).optional(),
    onlineRate: z.coerce.number().min(0.1).max(1).optional(),
    windowMin: z.coerce.number().int().min(30).max(720).optional(),
    rho: z.coerce.number().min(0).max(1).optional(),
    repetitions: z.coerce.number().int().min(1).max(10).optional(),
    seed: z.coerce.number().int().min(1).max(1e9).optional(),
    weights,
    distanceWeights: z.array(z.coerce.number().min(0.05).max(0.9)).max(6).optional(),
    doctorCounts: z.array(z.coerce.number().int().min(20).max(5000)).max(6).optional(),
  }).default({}),
})

let running = false
router.post('/run', rateLimit({ key: 'exp', max: 20 }), ah(async (req, res) => {
  const b = schema.parse(req.body)
  // Giới hạn khối lượng để tránh treo server
  const reps = b.params.repetitions || 3
  const work = b.experiment === 'scale'
    ? (b.params.doctorCounts || [100, 500, 1000, 5000]).reduce((s, n) => s + n, 0) * (b.params.requests || 1000) * 3 * reps
    : (b.params.doctors || 500) * (b.params.requests || 1000) * reps * (b.experiment === 'weights' ? (b.params.distanceWeights?.length || 3) + 1 : 3)
  if (work > 1.2e8) throw new HttpError(422, 'Khối lượng mô phỏng quá lớn – giảm số lần lặp, số yêu cầu hoặc số bác sĩ', 'TOO_LARGE')
  if (running) throw new HttpError(409, 'Đang có thí nghiệm khác chạy, vui lòng đợi')
  running = true
  try {
    const out = simulator.run(b.experiment, b.params)
    const saved = await one(
      `INSERT INTO experiment_runs (experiment, params, results, duration_ms, created_by) VALUES ($1, $2::jsonb, $3::jsonb, $4, $5) RETURNING id, created_at`,
      [out.experiment, JSON.stringify(out.params), JSON.stringify(out.results), out.durationMs, req.user.id],
    )
    res.json({ id: saved.id, createdAt: saved.created_at, ...out })
  } finally {
    running = false
  }
}))

router.get('/', ah(async (_req, res) => {
  res.json(await q(`SELECT id, experiment, params, duration_ms, created_at FROM experiment_runs ORDER BY created_at DESC LIMIT 50`))
}))

router.get('/:id', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const r = await one(`SELECT * FROM experiment_runs WHERE id = $1`, [id])
  if (!r) throw new HttpError(404, 'Không tìm thấy kết quả')
  res.json({ id: r.id, experiment: r.experiment, params: r.params, results: r.results, durationMs: r.duration_ms, createdAt: r.created_at })
}))

module.exports = finalize(router)
