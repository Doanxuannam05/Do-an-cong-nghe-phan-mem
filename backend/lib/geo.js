/**
 * Tính toán địa lý.
 *
 * Haversine: khoảng cách đường tròn lớn giữa 2 điểm (lat, lng) trên mặt cầu bán kính R = 6371 km.
 *   a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
 *   d = 2R · atan2(√a, √(1−a))
 * Sai số < 0.5% so với ellipsoid WGS-84 – đủ chính xác cho phạm vi đô thị.
 *
 * Bounding box: lọc thô bằng index (lat, lng) trước khi tính Haversine → giảm số bản ghi phải tính.
 */
const R = 6371

const toRad = (d) => (d * Math.PI) / 180

function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Hình chữ nhật bao quanh vòng tròn bán kính radiusKm */
function boundingBox(lat, lng, radiusKm) {
  const dLat = radiusKm / 111.32
  const dLng = radiusKm / (111.32 * Math.cos(toRad(lat)))
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng }
}

// Trung tâm TP. Đà Nẵng (khu vực Cầu Rồng – Hải Châu), dùng làm vị trí mặc định của demo
const DANANG_CENTER = { lat: 16.0611, lng: 108.2238 }

function isValidCoord(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

module.exports = { haversineKm, boundingBox, DANANG_CENTER, isValidCoord }
