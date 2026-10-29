/**
 * Xác thực: băm mật khẩu (scrypt), JWT HS256 tự ký, refresh token xoay vòng, RBAC middleware.
 * Không phụ thuộc thư viện ngoài – dùng module crypto chuẩn của Node.
 */
const crypto = require('crypto')
const { promisify } = require('util')
const { q, one } = require('./db')
const { HttpError } = require('./http')

const scrypt = promisify(crypto.scrypt)
const ACCESS_TTL_SEC = 60 * 60 // 1 giờ
const REFRESH_TTL_DAYS = 14

// Khóa ký JWT: ưu tiên JWT_SECRET, nếu không có thì dẫn xuất ổn định từ khóa môi trường.
const SECRET = process.env.JWT_SECRET || crypto.createHash('sha256').update(`medigo:${process.env.SURF_API_KEY || 'dev'}`).digest()

// ── Password ──
async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}
async function verifyPassword(password, stored) {
  const [alg, saltB64, hashB64] = String(stored || '').split('$')
  if (alg !== 'scrypt') return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length)
  return crypto.timingSafeEqual(expected, actual)
}

// ── JWT ──
const b64url = (buf) => Buffer.from(buf).toString('base64url')
function signJwt(payload, ttlSec = ACCESS_TTL_SEC) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSec }))
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}
function verifyJwt(token) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts
  const expected = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url')
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

// ── Refresh token ──
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
async function issueTokens(user) {
  const claims = { sub: user.id, role: user.role, name: user.full_name, pid: user.patient_id || null, did: user.doctor_id || null }
  const accessToken = signJwt(claims)
  const refreshToken = crypto.randomBytes(32).toString('base64url')
  await q(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(days => $3::int))`,
    [user.id, sha(refreshToken), REFRESH_TTL_DAYS],
  )
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SEC }
}

/** Xoay vòng: thu hồi refresh token cũ (nguyên tử) và trả user để cấp token mới */
async function consumeRefreshToken(token) {
  return one(
    `WITH r AS (
       UPDATE refresh_tokens SET revoked_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
       RETURNING user_id)
     SELECT u.id, u.role, u.full_name, u.is_active, p.id AS patient_id, d.id AS doctor_id
     FROM r JOIN users u ON u.id = r.user_id
     LEFT JOIN patients p ON p.user_id = u.id
     LEFT JOIN doctors d ON d.user_id = u.id`,
    [sha(token)],
  )
}
async function revokeRefreshToken(token) {
  await q(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [sha(token)])
}

// ── Middleware ──
function readToken(req) {
  const h = req.headers.authorization || ''
  if (h.startsWith('Bearer ')) return h.slice(7)
  // EventSource không gửi được header → cho phép ?token= cho luồng SSE
  if (req.query && req.query.token) return String(req.query.token)
  return null
}

/** Xác thực JWT (stateless – không tốn truy vấn DB) */
function requireAuth(req, _res, next) {
  const payload = verifyJwt(readToken(req))
  if (!payload) return next(new HttpError(401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại'))
  req.user = { id: payload.sub, role: payload.role, name: payload.name, patientId: payload.pid, doctorId: payload.did }
  next()
}

/** RBAC: chỉ cho phép các vai trò được liệt kê */
const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Chưa đăng nhập'))
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Bạn không có quyền truy cập chức năng này'))
  next()
}

/** Gắn req.user nếu có token hợp lệ, không bắt buộc */
function optionalAuth(req, _res, next) {
  const payload = verifyJwt(readToken(req))
  if (payload) req.user = { id: payload.sub, role: payload.role, name: payload.name, patientId: payload.pid, doctorId: payload.did }
  next()
}

module.exports = { hashPassword, verifyPassword, signJwt, verifyJwt, issueTokens, consumeRefreshToken, revokeRefreshToken, requireAuth, requireRole, optionalAuth }
