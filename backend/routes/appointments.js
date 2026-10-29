/**
 * /api/appointments – lịch hẹn đã đặt theo slot (SCHEDULED) của người dùng hiện tại.
 * (Bí danh theo đặc tả REST; dữ liệu chung bảng bookings.)
 */
const { createRouter, finalize, ah } = require('../lib/http')
const { q } = require('../lib/db')
const { requireAuth } = require('../lib/auth')

const router = createRouter()
router.use(requireAuth)

router.get('/', ah(async (req, res) => {
  const col = req.user.role === 'DOCTOR' ? 'b.doctor_id' : 'b.patient_id'
  const id = req.user.role === 'DOCTOR' ? req.user.doctorId : req.user.patientId
  const rows = await q(
    `SELECT b.id, b.code, b.status, b.consultation_type, b.scheduled_at, s.start_at, s.end_at, u.full_name AS doctor_name
     FROM bookings b LEFT JOIN appointment_slots s ON s.id = b.slot_id LEFT JOIN doctors d ON d.id = b.doctor_id LEFT JOIN users u ON u.id = d.user_id
     WHERE ${col} = $1 AND b.type = 'SCHEDULED' ORDER BY b.scheduled_at DESC LIMIT 100`,
    [id || 0],
  )
  res.json(rows)
}))

module.exports = finalize(router)
