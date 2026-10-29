/**
 * /api/consultations – bác sĩ bắt đầu / kết thúc phiên khám và ghi nhận kết quả (không chẩn đoán tự động).
 */
const { z } = require('zod')
const { createRouter, finalize, ah } = require('../lib/http')
const { requireAuth, requireRole } = require('../lib/auth')
const consultation = require('../lib/consultation')

const router = createRouter()
router.use(requireAuth, requireRole('DOCTOR'))

router.post('/:bookingId/start', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.bookingId)
  res.json(await consultation.start(id, req.user.doctorId, req.user.id))
}))

router.post('/:bookingId/end', ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.bookingId)
  const b = z.object({
    notes: z.string().trim().max(2000).optional(),
    advice: z.string().trim().max(2000).optional(),
    followUp: z.string().trim().max(300).optional(),
  }).parse(req.body || {})
  res.json(await consultation.end(id, req.user.doctorId, req.user.id, b))
}))

module.exports = finalize(router)
