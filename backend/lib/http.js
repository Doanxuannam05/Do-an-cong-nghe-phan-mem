/**
 * Tiện ích HTTP dùng chung: lỗi chuẩn hóa, async handler, logging, phân trang, rate limit.
 */
const { Router } = require('express')
const { ZodError } = require('zod')
require('./bootstrap') // khởi động worker + seed ngay khi server chạy

class HttpError extends Error {
  constructor(status, message, code, details) {
    super(message)
    this.status = status
    this.code = code || httpCode(status)
    this.details = details
  }
}
function httpCode(s) {
  return { 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 422: 'UNPROCESSABLE', 429: 'TOO_MANY_REQUESTS' }[s] || 'INTERNAL_ERROR'
}
const bad = (msg, details) => new HttpError(400, msg, 'BAD_REQUEST', details)
const notFound = (msg = 'Không tìm thấy dữ liệu') => new HttpError(404, msg)
const forbidden = (msg = 'Bạn không có quyền thực hiện thao tác này') => new HttpError(403, msg)
const conflict = (msg) => new HttpError(409, msg)

/** Bọc handler async để lỗi được chuyển vào error middleware */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

function requestLogger(req, res, next) {
  const t0 = Date.now()
  res.on('finish', () => {
    if (req.originalUrl.includes('/stream')) return
    const ms = Date.now() - t0
    const uid = req.user ? `u${req.user.id}` : '-'
    console.log(`[api] ${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${ms}ms ${uid}`)
    // KPI "API Response Time" → MongoDB api_metrics (ghi theo lô)
    const route = `${req.method} ${req.baseUrl}${req.route?.path || ''}`
    require('./telemetry').apiMetric({ route, status: res.statusCode, ms, role: req.user?.role || null })
  })
  next()
}

function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    })
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } })
  }
  // Lỗi unique constraint từ Postgres
  if (/duplicate key|unique constraint/i.test(err.message || '')) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'Dữ liệu đã tồn tại' } })
  }
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err.stack || err.message)
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống, vui lòng thử lại' } })
}

/** Router có sẵn logger + đảm bảo dữ liệu đã khởi tạo */
function createRouter() {
  const router = Router()
  router.use(requestLogger)
  router.use((req, res, next) => {
    require('./bootstrap')
      .ready()
      .then(() => next(), () => next(new HttpError(503, 'Hệ thống đang khởi tạo dữ liệu, vui lòng thử lại sau vài giây', 'INITIALIZING')))
  })
  return router
}

function finalize(router) {
  router.use(errorHandler)
  return router
}

function pagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1)
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit))
  return { page, limit, offset: (page - 1) * limit }
}
const paged = (items, total, { page, limit }) => ({ items, page, limit, total, totalPages: Math.ceil(total / limit) })

/** Rate limit đơn giản theo IP + khóa (in-memory, đủ cho prototype) */
function rateLimit({ windowMs = 60_000, max = 20, key = 'global' } = {}) {
  const hits = new Map()
  return (req, res, next) => {
    const k = `${key}:${req.ip}`
    const now = Date.now()
    const e = hits.get(k)
    if (!e || now - e.start > windowMs) {
      hits.set(k, { start: now, count: 1 })
      return next()
    }
    e.count++
    if (e.count > max) return next(new HttpError(429, 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút'))
    next()
  }
}

module.exports = { HttpError, bad, notFound, forbidden, conflict, ah, createRouter, finalize, errorHandler, pagination, paged, rateLimit }
