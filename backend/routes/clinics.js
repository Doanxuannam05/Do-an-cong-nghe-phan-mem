/** /api/clinics – phòng khám (công khai) + quản trị (ADMIN) */
const { z } = require('zod')
const { createRouter, finalize, ah, HttpError } = require('../lib/http')
const { q, one } = require('../lib/db')
const { requireAuth, requireRole } = require('../lib/auth')

const router = createRouter()

let cache = null
router.get('/', ah(async (_req, res) => {
  if (!cache || Date.now() - cache.at > 60_000) {
    cache = { at: Date.now(), rows: await q(`SELECT c.*, (SELECT count(*)::int FROM doctors d WHERE d.clinic_id = c.id AND d.verification_status = 'APPROVED') AS doctor_count FROM clinics c WHERE c.deleted_at IS NULL ORDER BY c.id`) }
  }
  res.json(cache.rows)
}))

const schema = z.object({
  name: z.string().trim().min(3).max(120),
  address: z.string().trim().max(200).optional(),
  district: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(30).optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
})

router.post('/', requireAuth, requireRole('ADMIN'), ah(async (req, res) => {
  const b = schema.parse(req.body)
  const r = await one(`INSERT INTO clinics (name, address, district, phone, latitude, longitude, status) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'ACTIVE')) RETURNING *`, [b.name, b.address || null, b.district || null, b.phone || null, b.latitude, b.longitude, b.status || null])
  cache = null
  res.status(201).json(r)
}))

router.patch('/:id', requireAuth, requireRole('ADMIN'), ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const b = schema.partial().parse(req.body)
  const r = await one(
    `UPDATE clinics SET name = COALESCE($2, name), address = COALESCE($3, address), district = COALESCE($4, district), phone = COALESCE($5, phone),
       latitude = COALESCE($6, latitude), longitude = COALESCE($7, longitude), status = COALESCE($8, status) WHERE id = $1 RETURNING *`,
    [id, b.name ?? null, b.address ?? null, b.district ?? null, b.phone ?? null, b.latitude ?? null, b.longitude ?? null, b.status ?? null],
  )
  if (!r) throw new HttpError(404, 'Không tìm thấy phòng khám')
  cache = null
  res.json(r)
}))

router.delete('/:id', requireAuth, requireRole('ADMIN'), ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  // Xóa mềm + tách bác sĩ khỏi phòng khám đã xóa
  await q(`WITH c AS (UPDATE clinics SET deleted_at = now(), status = 'INACTIVE' WHERE id = $1) UPDATE doctors SET clinic_id = NULL WHERE clinic_id = $1`, [id])
  await require('../lib/directory').load()
  cache = null
  res.json({ ok: true })
}))

module.exports = finalize(router)
