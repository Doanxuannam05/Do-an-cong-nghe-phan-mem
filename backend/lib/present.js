/** Chuyển đổi dữ liệu nội bộ → JSON công khai (camelCase), ẩn trường nhạy cảm */
const { haversineKm } = require('./geo')

function doctorPublic(d, specialties = [], from = null) {
  if (!d) return null
  const specs = d.specialtyIds.map((id) => specialties.find((s) => s.id === id)).filter(Boolean)
  const primary = specialties.find((s) => s.id === d.specialtyId) || specs[0]
  const distanceKm = from && Number.isFinite(from.lat) && d.lat != null ? Math.round(haversineKm(from.lat, from.lng, d.lat, d.lng) * 100) / 100 : null
  return {
    id: d.id,
    userId: d.userId,
    fullName: d.name,
    avatar: d.avatar,
    specialtyId: d.specialtyId,
    specialty: primary ? { id: primary.id, name: primary.name, slug: primary.slug, icon: primary.icon } : null,
    specialties: specs.map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
    clinic: d.clinicId ? { id: d.clinicId, name: d.clinicName, address: d.clinicAddress } : null,
    experienceYears: d.experienceYears,
    education: d.education,
    description: d.description,
    consultationFee: d.fee,
    consultationTypes: d.consultationTypes,
    latitude: d.lat,
    longitude: d.lng,
    rating: d.rating,
    totalReviews: d.totalReviews,
    status: d.status,
    availability: d.availability,
    verificationStatus: d.verificationStatus,
    isAvailableNow: d.status === 'ONLINE' && d.availability === 'AVAILABLE' && d.verified && (d.load || 0) < (d.capacity || 2),
    currentLoad: d.load || 0,
    isSimulated: d.isSimulated,
    distanceKm,
  }
}

/** Hồ sơ đầy đủ cho chính bác sĩ / admin */
function doctorPrivate(d, specialties) {
  return { ...doctorPublic(d, specialties), email: d.email, phone: d.phone, licenseNumber: d.licenseNumber, verificationNote: d.verificationNote, isActive: d.isActive, createdAt: d.createdAt, locationUpdatedAt: d.locationUpdatedAt }
}

module.exports = { doctorPublic, doctorPrivate }
