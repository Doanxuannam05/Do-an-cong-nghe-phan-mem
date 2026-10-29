/**
 * /api/payments – thanh toán prototype: CASH | BANK_TRANSFER | MOCK_PAYMENT.
 *   MOCK_PAYMENT  → cổng giả lập trả kết quả ngay (SUCCESS, hoặc FAILED nếu simulateFailure)
 *   CASH/BANK     → PENDING, bác sĩ/admin xác nhận đã nhận tiền → SUCCESS
 * Trạng thái: PENDING | SUCCESS | FAILED | REFUNDED. Kiến trúc chừa chỗ cho VNPay/MoMo (provider adapter).
 */
const crypto = require('crypto')
const { z } = require('zod')
const { createRouter, finalize, ah, HttpError } = require('../lib/http')
const { one } = require('../lib/db')
const { requireAuth, requireRole } = require('../lib/auth')
const events = require('../lib/events')
const { notifySync } = require('../lib/notify')

const router = createRouter()
router.use(requireAuth)

/** Adapter cổng thanh toán – thay bằng VNPay/MoMo bằng cách thêm provider mới cùng interface charge() */
const providers = {
  MOCK_PAYMENT: { charge: ({ simulateFailure }) => ({ status: simulateFailure ? 'FAILED' : 'SUCCESS', ref: `MOCK-${crypto.randomBytes(5).toString('hex').toUpperCase()}` }) },
  CASH: { charge: () => ({ status: 'PENDING', ref: null }) },
  BANK_TRANSFER: { charge: () => ({ status: 'PENDING', ref: `CK-${crypto.randomBytes(4).toString('hex').toUpperCase()}` }) },
}

router.post('/', requireRole('PATIENT'), ah(async (req, res) => {
  const b = z.object({ bookingId: z.coerce.number().int().positive(), method: z.enum(['CASH', 'BANK_TRANSFER', 'MOCK_PAYMENT']), simulateFailure: z.boolean().optional() }).parse(req.body)
  const result = providers[b.method].charge(b)
  const row = await one(
    `WITH bk AS (SELECT b.id, b.code, b.fee, b.status, d.user_id AS du FROM bookings b LEFT JOIN doctors d ON d.id = b.doctor_id
                 WHERE b.id = $1 AND b.patient_id = $2 AND b.status IN ('CONFIRMED','IN_PROGRESS','COMPLETED')),
     pay AS (INSERT INTO payments (booking_id, amount, method, status, transaction_ref, paid_at)
             SELECT id, COALESCE(fee, 0), $3, $4, $5, CASE WHEN $4 = 'SUCCESS' THEN now() END FROM bk
             ON CONFLICT (booking_id) DO UPDATE SET method = EXCLUDED.method, status = EXCLUDED.status, transaction_ref = EXCLUDED.transaction_ref,
                paid_at = EXCLUDED.paid_at, updated_at = now()
             WHERE payments.status IN ('PENDING','FAILED')
             RETURNING *)
     SELECT (SELECT row_to_json(pay) FROM pay) AS payment, (SELECT row_to_json(bk) FROM bk) AS booking`,
    [b.bookingId, req.user.patientId, b.method, result.status, result.ref],
  )
  if (!row.booking) throw new HttpError(409, 'Chỉ thanh toán được cho lịch khám đã xác nhận hoặc đã hoàn thành của bạn')
  if (!row.payment) throw new HttpError(409, 'Lịch khám này đã được thanh toán')
  if (row.payment.status === 'SUCCESS') {
    notifySync({ userId: req.user.id, type: 'PAYMENT_SUCCESS', title: 'Thanh toán thành công', body: `Đã thanh toán ${Number(row.payment.amount).toLocaleString('vi-VN')}đ cho lịch ${row.booking.code}`, data: { bookingId: b.bookingId } })
  }
  if (row.payment.status === 'SUCCESS') events.emit([req.user.id, row.booking.du].filter(Boolean), 'PAYMENT_COMPLETED', { bookingId: b.bookingId, amount: row.payment.amount })
  res.status(201).json(row.payment)
}))

/** Bác sĩ xác nhận đã nhận tiền mặt/chuyển khoản; admin có thể hoàn tiền */
router.patch('/:id', requireRole('DOCTOR', 'ADMIN'), ah(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const { status } = z.object({ status: z.enum(['SUCCESS', 'FAILED', 'REFUNDED']) }).parse(req.body)
  if (req.user.role === 'DOCTOR' && status === 'REFUNDED') throw new HttpError(403, 'Chỉ quản trị viên mới hoàn tiền')
  const row = await one(
    `UPDATE payments p SET status = $2, paid_at = CASE WHEN $2 = 'SUCCESS' THEN now() ELSE p.paid_at END, updated_at = now()
     FROM bookings b WHERE p.id = $1 AND b.id = p.booking_id AND ($3 = 'ADMIN' OR b.doctor_id = $4)
       AND ((($2 = 'SUCCESS' OR $2 = 'FAILED') AND p.status = 'PENDING') OR ($2 = 'REFUNDED' AND p.status = 'SUCCESS'))
     RETURNING p.*, (SELECT user_id FROM patients WHERE id = b.patient_id) AS patient_user_id`,
    [id, status, req.user.role, req.user.doctorId || 0],
  )
  if (!row) throw new HttpError(409, 'Không thể cập nhật trạng thái thanh toán này')
  if (status === 'SUCCESS') events.emit(row.patient_user_id, 'PAYMENT_COMPLETED', { bookingId: row.booking_id, amount: row.amount })
  res.json(row)
}))

module.exports = finalize(router)
