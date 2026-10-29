/**
 * Dữ liệu nghiên cứu & vận hành (PostgreSQL, ghi theo lô – không chặn luồng chính):
 *   dispatch_events  – từng sự kiện điều phối (phân tích Acceptance Rate, thời gian phản hồi…)
 *   doctor_locations – lịch sử vị trí bác sĩ
 *   api_metrics      – thời gian phản hồi của từng API
 */
const batch = require('./batch')

const CORE = ['event', 'bookingId', 'doctorId', 'rank', 'score', 'distanceKm', 'responseMs', 'at']

function dispatchEvent(e) {
  const data = Object.fromEntries(Object.entries(e).filter(([k, v]) => !CORE.includes(k) && v !== undefined))
  batch.enqueue('dispatch_events', {
    booking_id: e.bookingId, event: e.event, doctor_id: e.doctorId ?? null, rank: e.rank ?? null, score: e.score ?? null,
    distance_km: e.distanceKm ?? null, response_ms: e.responseMs ?? null, data: Object.keys(data).length ? data : null, at: e.at || new Date(),
  })
}

function doctorLocation(doctorId, lat, lng, source = 'app', at = new Date()) {
  batch.enqueue('doctor_locations', { doctor_id: Number(doctorId), latitude: lat, longitude: lng, source, recorded_at: at })
}

function apiMetric(m) {
  batch.enqueue('api_metrics', { route: m.route, status: m.status, ms: m.ms, role: m.role || null, at: new Date() })
}

module.exports = { dispatchEvent, doctorLocation, apiMetric }
