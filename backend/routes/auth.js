/**
 * /api/auth – Register, Login, Logout, Refresh Token, Forgot/Reset Password, Verify (prototype), Me
 */
const crypto = require('crypto')
const { z } = require('zod')
const { createRouter, finalize, ah, HttpError, rateLimit } = require('../lib/http')
const { q, one } = require('../lib/db')
const auth = require('../lib/auth')
const catalog = require('../lib/catalog')

const router = createRouter()

const loadUser = (where, param) =>
  one(
    `SELECT u.*, p.id AS patient_id, d.id AS doctor_id, d.verification_status
     FROM users u LEFT JOIN patients p ON p.user_id = u.id LEFT JOIN doctors d ON d.user_id = u.id
     WHERE ${where} AND u.deleted_at IS NULL`,
    [param],
  )

const publicUser = (u) => ({
  id: u.id, email: u.email, phone: u.phone, fullName: u.full_name, role: u.role, avatar: u.avatar,
  emailVerified: u.email_verified, patientId: u.patient_id || null, doctorId: u.doctor_id || null,
  verificationStatus: u.verification_status || null,
})

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Họ tên tối thiểu 2 ký tự').max(80),
  email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
  phone: z.string().trim().regex(/^0\d{9,10}$/, 'Số điện thoại không hợp lệ').optional().or(z.literal('')),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').regex(/[A-Za-z]/, 'Mật khẩu cần có chữ').regex(/\d/, 'Mật khẩu cần có số'),
  role: z.enum(['PATIENT', 'DOCTOR']).default('PATIENT'),
  // Bác sĩ
  specialtyId: z.coerce.number().int().positive().optional(),
  licenseNumber: z.string().trim().max(40).optional(),
  experienceYears: z.coerce.number().int().min(0).max(60).optional(),
  consultationFee: z.coerce.number().int().min(0).max(5_000_000).optional(),
})

router.post('/register', rateLimit({ key: 'register', max: 10 }), ah(async (req, res) => {
  const body = registerSchema.parse(req.body)
  if (body.role === 'DOCTOR' && (!body.specialtyId || !body.licenseNumber)) {
    throw new HttpError(422, 'Bác sĩ cần khai báo chuyên khoa và số chứng chỉ hành nghề', 'VALIDATION_ERROR')
  }
  const exists = await one(`SELECT id FROM users WHERE email = $1`, [body.email])
  if (exists) throw new HttpError(409, 'Email đã được sử dụng')
  const hash = await auth.hashPassword(body.password)
  const user = await one(
    `INSERT INTO users (email, phone, password_hash, role, full_name) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [body.email, body.phone || null, hash, body.role, body.fullName],
  )
  if (body.role === 'PATIENT') {
    const p = await one(`INSERT INTO patients (user_id, latitude, longitude) VALUES ($1, 16.0611, 108.2238) RETURNING id`, [user.id])
    user.patient_id = p.id
  } else {
    // Bác sĩ mới: PENDING – chưa xuất hiện trong matching cho tới khi Admin duyệt
    const d = await one(
      `WITH d AS (INSERT INTO doctors (user_id, specialty_id, license_number, experience_years, consultation_fee, latitude, longitude, verification_status)
                  VALUES ($1, $2, $3, $4, $5, 16.0611, 108.2238, 'PENDING') RETURNING id),
            s AS (INSERT INTO doctor_specialties (doctor_id, specialty_id, is_primary) SELECT id, $2, true FROM d)
       SELECT id FROM d`,
      [user.id, body.specialtyId, body.licenseNumber, body.experienceYears || 0, body.consultationFee || 200000],
    )
    user.doctor_id = d.id
    user.verification_status = 'PENDING'
    const admins = await q(`SELECT id FROM users WHERE role = 'ADMIN' AND is_active`)
    await require('../lib/notify').notify(admins.map((a) => ({ userId: a.id, type: 'DOCTOR_PENDING', title: 'Hồ sơ bác sĩ mới chờ duyệt', body: body.fullName, data: { doctorId: d.id } })))
  }
  const tokens = await auth.issueTokens(user)
  res.status(201).json({ user: publicUser(user), ...tokens })
}))

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email('Email không hợp lệ'), password: z.string().min(1, 'Nhập mật khẩu') })

router.post('/login', rateLimit({ key: 'login', max: 30 }), ah(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body)
  const user = await loadUser('u.email = $1', email)
  if (!user || !(await auth.verifyPassword(password, user.password_hash))) {
    throw new HttpError(401, 'Email hoặc mật khẩu không đúng', 'INVALID_CREDENTIALS')
  }
  if (!user.is_active) throw new HttpError(403, 'Tài khoản đã bị khóa. Liên hệ quản trị viên.')
  const tokens = await auth.issueTokens(user)
  q(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]).catch(() => {})
  res.json({ user: publicUser(user), ...tokens })
}))

router.post('/refresh', ah(async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(10) }).parse(req.body)
  const user = await auth.consumeRefreshToken(refreshToken)
  if (!user || !user.is_active) throw new HttpError(401, 'Refresh token không hợp lệ hoặc đã hết hạn')
  res.json(await auth.issueTokens(user))
}))

router.post('/logout', ah(async (req, res) => {
  const token = req.body?.refreshToken
  if (token) await auth.revokeRefreshToken(String(token))
  res.json({ ok: true })
}))

router.get('/me', auth.requireAuth, ah(async (req, res) => {
  const user = await loadUser('u.id = $1', req.user.id)
  if (!user) throw new HttpError(404, 'Không tìm thấy tài khoản')
  res.json({ user: publicUser(user) })
}))

/**
 * Quên mật khẩu (prototype): sinh mã 6 số, hạn 15 phút.
 * Môi trường thật sẽ gửi qua email/SMS; prototype trả mã về để demo (devCode).
 */
router.post('/forgot-password', rateLimit({ key: 'forgot', max: 5 }), ah(async (req, res) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email('Email không hợp lệ') }).parse(req.body)
  const code = String(crypto.randomInt(100000, 999999))
  // Chỉ lưu dấu vân tay (hash) của mã, không lưu mã gốc
  const u = await one(
    `UPDATE users SET reset_code = $2, reset_expires_at = now() + interval '15 minutes' WHERE email = $1 AND deleted_at IS NULL RETURNING id`,
    [email, resetFingerprint(code, email)],
  )
  // Luôn trả cùng thông điệp để không lộ email nào tồn tại; prototype hiển thị mã thay cho gửi email
  res.json({ message: 'Nếu email tồn tại, mã đặt lại mật khẩu đã được gửi (hiệu lực 15 phút).', devCode: u ? code : undefined })
}))

router.post('/reset-password', rateLimit({ key: 'reset', max: 10 }), ah(async (req, res) => {
  const body = z.object({
    email: z.string().trim().toLowerCase().email(),
    code: z.string().regex(/^\d{6}$/, 'Mã gồm 6 chữ số'),
    newPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').regex(/[A-Za-z]/, 'Mật khẩu cần có chữ').regex(/\d/, 'Mật khẩu cần có số'),
  }).parse(req.body)
  const u = await one(`SELECT id, reset_code, reset_expires_at FROM users WHERE email = $1 AND reset_expires_at > now()`, [body.email])
  const ok = u && u.reset_code && u.reset_code === resetFingerprint(body.code, body.email)
  if (!ok) throw new HttpError(400, 'Mã không đúng hoặc đã hết hạn')
  await q(`UPDATE users SET password_hash = $2, reset_code = NULL, reset_expires_at = NULL, updated_at = now() WHERE id = $1`, [u.id, await auth.hashPassword(body.newPassword)])
  await q(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [u.id])
  res.json({ ok: true, message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.' })
}))
const resetFingerprint = (code, email) => crypto.createHash('sha256').update(`reset:${email}:${code}`).digest('hex')

/** Xác minh email/điện thoại (prototype): đánh dấu verified ngay */
router.post('/verify', auth.requireAuth, ah(async (req, res) => {
  await q(`UPDATE users SET email_verified = true WHERE id = $1`, [req.user.id])
  res.json({ ok: true })
}))

router.get('/specialties', ah(async (_req, res) => res.json(await catalog.specialties())))

module.exports = finalize(router)
