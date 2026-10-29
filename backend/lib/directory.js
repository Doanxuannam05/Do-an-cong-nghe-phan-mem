/**
 * Doctor Directory – bản sao trong bộ nhớ của bảng doctors (read-model).
 *
 * Lý do kiến trúc: tìm kiếm bác sĩ quanh vị trí và matching là thao tác đọc tần suất rất cao
 * (giống Grab tìm tài xế). Đưa read-model vào RAM giúp:
 *   - Matching/Nearby không tốn truy vấn DB (độ trễ ~ vài ms thay vì vài trăm ms).
 *   - Có thể thay bằng Redis GEO / PostGIS khi mở rộng (cùng interface).
 * Nhất quán: mọi thao tác ghi (đổi trạng thái, vị trí, hồ sơ, rating, duyệt) cập nhật DB rồi
 * patch() vào directory; đồng bộ lại toàn bộ từ DB mỗi 2 phút.
 */
const { q } = require('./db')

const doctors = new Map()
let loadedAt = 0
let loading = null

const SQL = `
  SELECT d.id, d.user_id, u.full_name, u.avatar, u.is_active, u.email, u.phone, d.specialty_id, d.clinic_id,
         d.license_number, d.experience_years, d.education, d.description, d.consultation_fee, d.consultation_types,
         d.latitude, d.longitude, d.location_updated_at, d.rating, d.total_reviews, d.status, d.availability,
         d.verification_status, d.verification_note, d.is_simulated, d.accept_prob, d.created_at,
         c.name AS clinic_name, c.address AS clinic_address,
         COALESCE((SELECT string_agg(ds.specialty_id::text, ',') FROM doctor_specialties ds WHERE ds.doctor_id = d.id), d.specialty_id::text) AS spec_ids,
         (SELECT count(*) FROM bookings b WHERE b.doctor_id = d.id AND b.status IN ('ACCEPTED','CONFIRMED','IN_PROGRESS')
            AND (b.type = 'ON_DEMAND' OR b.status = 'IN_PROGRESS'))::int AS load
  FROM doctors d JOIN users u ON u.id = d.user_id LEFT JOIN clinics c ON c.id = d.clinic_id
  WHERE u.deleted_at IS NULL`

function toEntry(r) {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.full_name,
    avatar: r.avatar,
    email: r.email,
    phone: r.phone,
    isActive: r.is_active,
    specialtyId: r.specialty_id,
    specialtyIds: String(r.spec_ids || '').split(',').filter(Boolean).map(Number),
    clinicId: r.clinic_id,
    clinicName: r.clinic_name,
    clinicAddress: r.clinic_address,
    licenseNumber: r.license_number,
    experienceYears: r.experience_years,
    education: r.education,
    description: r.description,
    fee: r.consultation_fee,
    consultationTypes: Array.isArray(r.consultation_types) ? r.consultation_types : ['ONLINE', 'IN_PERSON'],
    lat: r.latitude,
    lng: r.longitude,
    locationUpdatedAt: r.location_updated_at,
    rating: r.rating,
    totalReviews: r.total_reviews,
    status: r.status,
    availability: r.availability,
    verificationStatus: r.verification_status,
    verificationNote: r.verification_note,
    verified: r.verification_status === 'APPROVED',
    isSimulated: r.is_simulated,
    acceptProb: r.accept_prob,
    createdAt: r.created_at,
    load: r.load || 0,
    capacity: 2,
  }
}

async function load() {
  if (loading) return loading
  loading = (async () => {
    const rows = await q(SQL)
    const seen = new Set()
    for (const r of rows) {
      const e = toEntry(r)
      // giữ cờ "đang có lời mời" do dispatch quản lý trong bộ nhớ
      const prev = doctors.get(e.id)
      if (prev) e.pendingOffer = prev.pendingOffer
      doctors.set(e.id, e)
      seen.add(e.id)
    }
    for (const id of doctors.keys()) if (!seen.has(id)) doctors.delete(id)
    loadedAt = Date.now()
  })().finally(() => (loading = null))
  return loading
}

async function ensure() {
  if (!loadedAt) await load()
}

/** Nạp lại một bác sĩ (sau khi sửa hồ sơ phức tạp) */
async function reload(id) {
  const rows = await q(`${SQL} AND d.id = $1`, [id])
  if (rows[0]) {
    const prev = doctors.get(id)
    const e = toEntry(rows[0])
    if (prev) e.pendingOffer = prev.pendingOffer
    doctors.set(id, e)
  }
  return doctors.get(id)
}

function patch(id, fields) {
  const d = doctors.get(Number(id))
  if (d) Object.assign(d, fields, fields.verificationStatus ? { verified: fields.verificationStatus === 'APPROVED' } : {})
  return d
}

const get = (id) => doctors.get(Number(id)) || null
const byUserId = (uid) => [...doctors.values()].find((d) => d.userId === Number(uid)) || null
const all = () => [...doctors.values()]
const adjustLoad = (id, delta) => {
  const d = doctors.get(Number(id))
  if (d) d.load = Math.max(0, (d.load || 0) + delta)
}

module.exports = { load, ensure, reload, patch, get, byUserId, all, adjustLoad, loadedAt: () => loadedAt }
