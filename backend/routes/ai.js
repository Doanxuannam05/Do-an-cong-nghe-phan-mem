/**
 * /api/ai/suggest-specialty – gợi ý CHUYÊN KHOA từ mô tả triệu chứng + Top 5 bác sĩ phù hợp.
 * Không chẩn đoán, không kê đơn, không điều trị. Luôn kèm disclaimer.
 */
const { z } = require('zod')
const { createRouter, finalize, ah, rateLimit } = require('../lib/http')
const { optionalAuth } = require('../lib/auth')
const { suggest, DISCLAIMER } = require('../lib/symptoms')
const catalog = require('../lib/catalog')
const dispatch = require('../lib/dispatch')
const directory = require('../lib/directory')
const { doctorPublic } = require('../lib/present')

const router = createRouter()

router.post('/suggest-specialty', optionalAuth, rateLimit({ key: 'ai', max: 40 }), ah(async (req, res) => {
  const b = z.object({ text: z.string().trim().min(3, 'Mô tả tối thiểu 3 ký tự').max(500), lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }).parse(req.body)
  const t0 = process.hrtime.bigint()
  const r = suggest(b.text)
  const specs = await catalog.specialties()
  const bySlug = (slug) => specs.find((s) => s.slug === slug)
  const main = bySlug(r.slug)
  let doctors = []
  if (main && b.lat != null && b.lng != null) {
    const m = await dispatch.findDoctors({ lat: b.lat, lng: b.lng, specialtyId: main.id, radiusKm: 5, algorithm: 'multi', limit: 5 })
    doctors = m.ranked.map((c) => ({ ...doctorPublic(directory.get(c.doctorId), specs, b), matchScore: c.score, components: c.components }))
  }
  res.json({
    specialty: main ? { id: main.id, name: main.name, slug: main.slug, icon: main.icon } : null,
    confidence: r.confidence,
    fallback: r.fallback,
    matchedKeywords: r.matched,
    alternatives: r.alternatives.map((a) => ({ ...a, specialty: bySlug(a.slug) ? { id: bySlug(a.slug).id, name: bySlug(a.slug).name } : null })),
    emergency: r.redFlags.length > 0,
    emergencyMessage: r.redFlags.length ? 'Mô tả có dấu hiệu có thể nguy hiểm. Hãy gọi cấp cứu 115 hoặc đến cơ sở y tế gần nhất ngay, không chờ đặt lịch.' : null,
    doctors,
    disclaimer: DISCLAIMER,
    method: 'Mô hình từ vựng triệu chứng có trọng số (tiếng Việt, không dấu/có dấu)',
    elapsedMs: Number(process.hrtime.bigint() - t0) / 1e6,
  })
}))

module.exports = finalize(router)
