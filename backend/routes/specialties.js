/** /api/specialties – danh mục chuyên khoa (công khai) + quản trị (ADMIN) */
const { z } = require('zod')
const { createRouter, finalize, ah, HttpError } = require('../lib/http')
const { one } = require('../lib/db')
const { requireAuth, requireRole } = require('../lib/auth')
const catalog = require('../lib/catalog')
const directory = require('../lib/directory')

const router = createRouter()

router.get('/', ah(async (req, res) => {
  const list = await catalog.specialties()
  await directory.ensure()
  const docs = directory.all()
  res.json(list.filter((s) => req.query.all === 'true' || s.status === 'ACTIVE').map((s) => ({
    ...s,
    doctorCount: docs.filter((d) => d.verified && d.specialtyIds.includes(s.id)).length,
    onlineCount: docs.filter((d) => d.verified && d.status === 'ONLINE' && d.availability === 'AVAILABLE' && d.specialtyIds.includes(s.id)).length,
  })))
}))

const schema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, 'slug chỉ gồm a-z, 0-9, -').max(40),
  description: z.string().trim().max(300).optional(),
  icon: z.string().trim().max(40).optional(),
  related: z.array(z.string()).max(5).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
})

router.post('/', requireAuth, requireRole('ADMIN'), ah(async (req, res) => {
  const b = schema.parse(req.body)
  const r = await one(`INSERT INTO specialties (name, slug, description, icon, related, status) VALUES ($1, $2, $3, $4, $5::jsonb, COALESCE($6, 'ACTIVE')) RETURNING *`,
    [b.name, b.slug, b.description || null, b.icon || 'stethoscope', JSON.stringify(b.related || []), b.status || null])
  catalog.invalidate()
  res.status(201).json(r)
}))

router.patch('/:id', requireAuth, requireRole('ADMIN'), ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const b = schema.partial().parse(req.body)
  const r = await one(
    `UPDATE specialties SET name = COALESCE($2, name), slug = COALESCE($3, slug), description = COALESCE($4, description), icon = COALESCE($5, icon),
       related = COALESCE($6::jsonb, related), status = COALESCE($7, status) WHERE id = $1 RETURNING *`,
    [id, b.name ?? null, b.slug ?? null, b.description ?? null, b.icon ?? null, b.related ? JSON.stringify(b.related) : null, b.status ?? null],
  )
  if (!r) throw new HttpError(404, 'Không tìm thấy chuyên khoa')
  catalog.invalidate()
  res.json(r)
}))

module.exports = finalize(router)
