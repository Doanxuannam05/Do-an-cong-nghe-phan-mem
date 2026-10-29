/**
 * Dữ liệu mô phỏng – TP. Đà Nẵng. KHÔNG có dữ liệu y tế/cá nhân thật.
 * Tên bác sĩ, phòng khám, bệnh nhân đều là giả lập. Bộ sinh ngẫu nhiên có seed cố định → tái lập được.
 */
const { q, one, bulkInsert } = require('./db')
const { hashPassword } = require('./auth')
const { haversineKm } = require('./geo')
const { generateSlots } = require('./slots')
const batch = require('./batch')
const telemetry = require('./telemetry')
const { notifySync } = require('./notify')

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SPECIALTIES = [
  { slug: 'tim-mach', name: 'Tim mạch', icon: 'heart-pulse', related: ['noi-khoa'], description: 'Bệnh lý tim, huyết áp, mạch máu.' },
  { slug: 'tai-mui-hong', name: 'Tai Mũi Họng', icon: 'ear', related: ['noi-khoa', 'nhi-khoa'], description: 'Viêm họng, viêm xoang, viêm tai, nghẹt mũi.' },
  { slug: 'da-lieu', name: 'Da liễu', icon: 'scan-face', related: ['noi-khoa'], description: 'Mụn, dị ứng da, nấm, viêm da.' },
  { slug: 'nhi-khoa', name: 'Nhi khoa', icon: 'baby', related: ['noi-khoa'], description: 'Chăm sóc sức khỏe trẻ em từ sơ sinh đến 16 tuổi.' },
  { slug: 'noi-khoa', name: 'Nội khoa', icon: 'stethoscope', related: ['tim-mach', 'than-kinh'], description: 'Khám tổng quát, tiêu hóa, hô hấp, nội tiết.' },
  { slug: 'ngoai-khoa', name: 'Ngoại khoa', icon: 'bandage', related: ['noi-khoa'], description: 'Chấn thương, vết thương, tiểu phẫu.' },
  { slug: 'san-khoa', name: 'Sản khoa', icon: 'flower-2', related: ['noi-khoa'], description: 'Thai kỳ, sức khỏe sinh sản phụ nữ.' },
  { slug: 'rang-ham-mat', name: 'Răng Hàm Mặt', icon: 'smile', related: ['tai-mui-hong'], description: 'Đau răng, viêm nướu, chỉnh nha.' },
  { slug: 'mat', name: 'Mắt', icon: 'eye', related: ['than-kinh'], description: 'Cận thị, đau mắt đỏ, khô mắt.' },
  { slug: 'than-kinh', name: 'Thần kinh', icon: 'brain', related: ['noi-khoa'], description: 'Đau đầu, chóng mặt, mất ngủ, rối loạn thần kinh.' },
]

// Phòng khám giả lập – tên hư cấu, tọa độ nằm trong nội thành Đà Nẵng
const CLINICS = [
  { name: 'Phòng khám Đa khoa An Tâm', address: '112 Lê Duẩn', district: 'Hải Châu', lat: 16.0702, lng: 108.2176 },
  { name: 'Phòng khám Sông Hàn', address: '45 Bạch Đằng', district: 'Hải Châu', lat: 16.0645, lng: 108.2241 },
  { name: 'Phòng khám Hòa Thuận', address: '230 Nguyễn Văn Linh', district: 'Hải Châu', lat: 16.0563, lng: 108.2105 },
  { name: 'Phòng khám Thanh Khê Xanh', address: '78 Điện Biên Phủ', district: 'Thanh Khê', lat: 16.0662, lng: 108.1912 },
  { name: 'Phòng khám Tân Chính', address: '15 Hà Huy Tập', district: 'Thanh Khê', lat: 16.0571, lng: 108.1838 },
  { name: 'Phòng khám Biển Xanh', address: '301 Ngô Quyền', district: 'Sơn Trà', lat: 16.0726, lng: 108.2369 },
  { name: 'Phòng khám An Hải', address: '96 Phạm Văn Đồng', district: 'Sơn Trà', lat: 16.0758, lng: 108.2442 },
  { name: 'Phòng khám Mỹ An', address: '52 Lê Văn Hiến', district: 'Ngũ Hành Sơn', lat: 16.0381, lng: 108.2453 },
  { name: 'Phòng khám Non Nước', address: '140 Lê Văn Hiến', district: 'Ngũ Hành Sơn', lat: 16.0129, lng: 108.2541 },
  { name: 'Phòng khám Hòa Khánh', address: '510 Tôn Đức Thắng', district: 'Liên Chiểu', lat: 16.0708, lng: 108.1532 },
  { name: 'Phòng khám Hòa Xuân', address: '33 Nguyễn Hữu Thọ', district: 'Cẩm Lệ', lat: 16.0228, lng: 108.2152 },
  { name: 'Phòng khám Khuê Trung', address: '61 Cách Mạng Tháng 8', district: 'Cẩm Lệ', lat: 16.0298, lng: 108.2036 },
]

const LAST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Trương']
const MID_M = ['Văn', 'Minh', 'Quốc', 'Đức', 'Hữu', 'Gia', 'Thanh', 'Hoàng', 'Công']
const MID_F = ['Thị', 'Ngọc', 'Thu', 'Thanh', 'Bảo', 'Mỹ', 'Khánh', 'Phương']
const FIRST_M = ['Bình', 'Dũng', 'Hải', 'Hiếu', 'Hùng', 'Khoa', 'Long', 'Nam', 'Phong', 'Phúc', 'Quân', 'Sơn', 'Trung', 'Tuấn', 'Thắng', 'Vinh', 'Đạt', 'Lộc']
const FIRST_F = ['An', 'Châu', 'Giang', 'Hà', 'Hạnh', 'Hoa', 'Lan', 'Linh', 'Mai', 'Nga', 'Quỳnh', 'Tâm', 'Thảo', 'Trang', 'Uyên', 'Vy', 'Yến', 'Nhi']
const EDU = [
  'Bác sĩ Chuyên khoa I – Trường Đại học Y Dược Huế',
  'Thạc sĩ Y học – Trường Đại học Y Hà Nội',
  'Bác sĩ Chuyên khoa II – Đại học Y Dược TP. Hồ Chí Minh',
  'Bác sĩ Đa khoa – Trường Đại học Kỹ thuật Y – Dược Đà Nẵng',
  'Tiến sĩ Y học – Học viện Quân y',
]
const COMMENTS = {
  5: ['Bác sĩ tư vấn rất kỹ, dễ hiểu.', 'Đến nhanh, thái độ nhẹ nhàng.', 'Rất hài lòng, sẽ quay lại.', 'Giải thích cặn kẽ, không vội vàng.', 'Bác sĩ nhiệt tình, hỏi han chu đáo.'],
  4: ['Tư vấn ổn, chờ hơi lâu một chút.', 'Bác sĩ dễ chịu, phí hợp lý.', 'Khá tốt, gọi video hơi giật.', 'Hài lòng, mong có thêm khung giờ tối.'],
  3: ['Tạm được, bác sĩ hơi vội.', 'Bình thường, cần giải thích rõ hơn.'],
  2: ['Phải chờ lâu, thông tin chưa rõ.'],
  1: ['Bác sĩ đến trễ so với hẹn.'],
}

const vnDate = (daysAgo, hour, minute, now) => {
  // giờ Việt Nam (UTC+7) → UTC
  const d = new Date(now.getTime() - daysAgo * 86400000)
  const local = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour - 7, minute))
  return local
}

async function seed() {
  const t0 = Date.now()
  const rng = mulberry32(20261016)
  const pick = (arr) => arr[Math.floor(rng() * arr.length)]
  const between = (a, b) => a + rng() * (b - a)
  const intBetween = (a, b) => Math.floor(between(a, b + 1))
  const now = new Date()

  const usedNames = new Set()
  const genName = (female) => {
    for (;;) {
      const n = `${pick(LAST)} ${pick(female ? MID_F : MID_M)} ${pick(female ? FIRST_F : FIRST_M)}`
      if (!usedNames.has(n)) {
        usedNames.add(n)
        return n
      }
    }
  }

  console.log('[seed] bắt đầu tạo dữ liệu mô phỏng Đà Nẵng…')
  const pwd = await hashPassword('Demo@123')

  await q(`INSERT INTO roles (name, description) VALUES ('PATIENT','Người bệnh'),('DOCTOR','Bác sĩ'),('ADMIN','Quản trị viên') ON CONFLICT DO NOTHING`)
  const specs = await bulkInsert('specialties', { slug: 'text', name: 'text', icon: 'text', related: 'jsonb', description: 'text' }, SPECIALTIES, { returning: 'id, slug' })
  const specId = Object.fromEntries(specs.map((s) => [s.slug, s.id]))
  const clinics = await bulkInsert('clinics', { name: 'text', address: 'text', district: 'text', latitude: 'float8', longitude: 'float8', phone: 'text' },
    CLINICS.map((c, i) => ({ name: c.name, address: `${c.address}, ${c.district}, Đà Nẵng`, district: c.district, latitude: c.lat, longitude: c.lng, phone: `0236 38${String(1000 + i * 137).slice(-4)} ${10 + i}` })),
    { returning: 'id, latitude, longitude' })

  // ── Users ──
  const users = []
  const createdAgo = (maxDays) => new Date(now.getTime() - Math.pow(rng(), 1.5) * maxDays * 86400000).toISOString()
  users.push({ email: 'admin@demo.vn', full_name: 'Quản trị viên MediGo', role: 'ADMIN', phone: '0905000001', created_at: createdAgo(200) })
  users.push({ email: 'patient@demo.vn', full_name: 'Nguyễn Văn An', role: 'PATIENT', phone: '0905123456', created_at: createdAgo(120) })
  users.push({ email: 'doctor@demo.vn', full_name: 'Trần Minh Khoa', role: 'DOCTOR', phone: '0905654321', created_at: createdAgo(180) })

  const doctorDefs = []
  const N_DOCTORS = 60
  for (let i = 0; i < N_DOCTORS - 1; i++) {
    const female = rng() < 0.45
    const name = genName(female)
    const spec = SPECIALTIES[i % SPECIALTIES.length].slug
    users.push({ email: `bs${String(i + 1).padStart(3, '0')}@sim.medigo.vn`, full_name: name, role: 'DOCTOR', phone: `09${intBetween(10000000, 99999999)}`, created_at: createdAgo(180) })
    doctorDefs.push({ email: users[users.length - 1].email, spec, female })
  }
  const patientDefs = []
  for (let i = 0; i < 120; i++) {
    const female = rng() < 0.5
    users.push({ email: `bn${String(i + 1).padStart(3, '0')}@sim.medigo.vn`, full_name: genName(female), role: 'PATIENT', phone: `03${intBetween(10000000, 99999999)}`, created_at: createdAgo(180) })
    patientDefs.push({ email: users[users.length - 1].email, female })
  }
  const userRows = await bulkInsert('users', { email: 'text', full_name: 'text', role: 'text', phone: 'text', password_hash: 'text', email_verified: 'boolean', created_at: 'timestamptz' },
    users.map((u) => ({ ...u, password_hash: pwd, email_verified: true })), { returning: 'id, email' })
  const uid = Object.fromEntries(userRows.map((u) => [u.email, u.id]))

  // ── Patients ──
  const jitter = (lat, lng, km) => {
    const r = km * Math.sqrt(rng())
    const a = rng() * 2 * Math.PI
    return { lat: lat + (r / 111.32) * Math.cos(a), lng: lng + (r / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(a) }
  }
  const clampLand = (p) => ({ lat: Math.min(p.lat, 16.086), lng: Math.min(p.lng, 108.247 + Math.max(0, 16.07 - p.lat) * 0.3) })
  const patientRows = [{ user_id: uid['patient@demo.vn'], date_of_birth: '1998-04-12', gender: 'MALE', address: '78 Lê Duẩn, Hải Châu, Đà Nẵng', latitude: 16.0681, longitude: 108.2189, is_simulated: false }]
  for (const p of patientDefs) {
    const c = pick(CLINICS)
    const loc = clampLand(jitter(c.lat, c.lng, 2.5))
    patientRows.push({ user_id: uid[p.email], date_of_birth: `${intBetween(1955, 2012)}-${String(intBetween(1, 12)).padStart(2, '0')}-${String(intBetween(1, 28)).padStart(2, '0')}`, gender: p.female ? 'FEMALE' : 'MALE', address: `Quận ${c.district}, Đà Nẵng`, latitude: loc.lat, longitude: loc.lng, is_simulated: true })
  }
  const pRows = await bulkInsert('patients', { user_id: 'int', date_of_birth: 'date', gender: 'text', address: 'text', latitude: 'float8', longitude: 'float8', is_simulated: 'boolean' }, patientRows, { returning: 'id, user_id, latitude, longitude' })
  const demoPatient = pRows.find((p) => p.user_id === uid['patient@demo.vn'])

  // ── Doctors ──
  const docRows = []
  // Bác sĩ demo (người dùng thật điều khiển) – Tai Mũi Họng, gần bệnh nhân demo ~1.2 km
  docRows.push({
    user_id: uid['doctor@demo.vn'], specialty_id: specId['tai-mui-hong'], clinic_id: clinics[1].id, license_number: 'CCHN-DN-004127',
    experience_years: 12, education: EDU[0], description: 'Hơn 12 năm khám và tư vấn các bệnh lý tai mũi họng thường gặp ở người lớn và trẻ em.',
    consultation_fee: 250000, consultation_types: ['ONLINE', 'IN_PERSON'], latitude: 16.0612, longitude: 108.2272, status: 'ONLINE', availability: 'AVAILABLE',
    verification_status: 'APPROVED', is_simulated: false, accept_prob: 1, created_at: users[2].created_at, quality: 4.8,
  })
  doctorDefs.forEach((d, i) => {
    const c = CLINICS[i % CLINICS.length]
    const clinicId = clinics[i % CLINICS.length].id
    const loc = clampLand(jitter(c.lat, c.lng, 1.6))
    const r = rng()
    const status = r < 0.68 ? 'ONLINE' : 'OFFLINE'
    const availability = status === 'ONLINE' && rng() < 0.88 ? 'AVAILABLE' : 'UNAVAILABLE'
    const verification = i < 4 ? 'PENDING' : i === 4 ? 'REJECTED' : 'APPROVED'
    const t = rng()
    const types = t < 0.7 ? ['ONLINE', 'IN_PERSON'] : t < 0.85 ? ['ONLINE'] : ['IN_PERSON']
    const exp = intBetween(2, 28)
    const specName = SPECIALTIES.find((s) => s.slug === d.spec).name
    docRows.push({
      user_id: uid[d.email], specialty_id: specId[d.spec], clinic_id: clinicId, license_number: `CCHN-DN-${String(intBetween(1000, 99999)).padStart(6, '0')}`,
      experience_years: exp, education: pick(EDU), description: `${exp} năm kinh nghiệm chuyên khoa ${specName}. Tư vấn tận tình, ưu tiên giải thích dễ hiểu cho người bệnh.`,
      consultation_fee: Math.round((150000 + exp * 6000 + rng() * 150000) / 10000) * 10000, consultation_types: types, latitude: loc.lat, longitude: loc.lng,
      status: verification === 'APPROVED' ? status : 'OFFLINE', availability: verification === 'APPROVED' ? availability : 'UNAVAILABLE',
      verification_status: verification, is_simulated: true, accept_prob: Math.round(between(0.55, 0.93) * 100) / 100,
      created_at: users.find((u) => u.email === d.email).created_at, quality: between(3.7, 4.95),
    })
  })
  const dRows = await bulkInsert('doctors', {
    user_id: 'int', specialty_id: 'int', clinic_id: 'int', license_number: 'text', experience_years: 'int', education: 'text', description: 'text',
    consultation_fee: 'int', consultation_types: 'jsonb', latitude: 'float8', longitude: 'float8', status: 'text', availability: 'text',
    verification_status: 'text', is_simulated: 'boolean', accept_prob: 'real', created_at: 'timestamptz',
  }, docRows, { returning: 'id, user_id' })
  const doctors = dRows.map((r) => ({ ...r, ...docRows.find((d) => d.user_id === r.user_id) }))
  const demoDoctor = doctors.find((d) => d.user_id === uid['doctor@demo.vn'])

  // Chuyên khoa phụ: Nội khoa ↔ một số bác sĩ khác có thêm chuyên khoa thứ hai
  const dsRows = doctors.map((d) => ({ doctor_id: d.id, specialty_id: d.specialty_id, is_primary: true }))
  doctors.filter((d) => d.is_simulated && rng() < 0.15 && d.specialty_id !== specId['noi-khoa']).forEach((d) => dsRows.push({ doctor_id: d.id, specialty_id: specId['noi-khoa'], is_primary: false }))
  await bulkInsert('doctor_specialties', { doctor_id: 'int', specialty_id: 'int', is_primary: 'boolean' }, dsRows, { returning: '' })
  // Lịch sử vị trí ban đầu (ghi theo lô)
  for (const d of doctors) telemetry.doctorLocation(d.id, d.latitude, d.longitude, 'seed')

  // ── Schedules ──
  const schedRows = []
  for (const d of doctors) {
    const days = d.id === demoDoctor.id ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0].filter(() => rng() < 0.75)
    for (const dow of days) {
      const shift = d.id === demoDoctor.id ? 3 : intBetween(0, 2)
      if (shift === 0 || shift === 3) schedRows.push({ doctor_id: d.id, day_of_week: dow, start_time: '07:30', end_time: '11:30' })
      if (shift === 1 || shift === 3) schedRows.push({ doctor_id: d.id, day_of_week: dow, start_time: '13:30', end_time: '17:00' })
      if (shift === 2 || shift === 3) schedRows.push({ doctor_id: d.id, day_of_week: dow, start_time: '18:00', end_time: '21:00' })
    }
  }
  await bulkInsert('doctor_schedules', { doctor_id: 'int', day_of_week: 'int', start_time: 'text', end_time: 'text' }, schedRows, { returning: '' })
  await generateSlots({ days: 7 })

  // ── Lịch sử booking 60 ngày (phục vụ dashboard + thống kê) ──
  const approved = doctors.filter((d) => d.verification_status === 'APPROVED')
  const bookings = []
  const simPatients = pRows.filter((p) => p.id !== demoPatient.id)
  let seq = 0
  for (let day = 59; day >= 0; day--) {
    const growth = 0.55 + (60 - day) / 60 * 0.6
    const count = Math.round((7 + rng() * 8) * growth)
    for (let k = 0; k < count; k++) {
      const hour = intBetween(7, 21)
      const created = vnDate(day, hour, intBetween(0, 59), now)
      if (created > now) continue
      const p = pick(simPatients)
      const spec = pick(SPECIALTIES).slug
      const pool = approved.filter((d) => d.specialty_id === specId[spec])
      const ranked = pool.map((d) => ({ d, dist: haversineKm(p.latitude, p.longitude, d.latitude, d.longitude) })).sort((a, b) => a.dist - b.dist)
      const chosen = ranked[Math.min(ranked.length - 1, Math.floor(Math.pow(rng(), 2) * ranked.length))]
      const type = rng() < 0.65 ? 'ON_DEMAND' : 'SCHEDULED'
      const ctype = chosen.d.consultation_types.length === 1 ? chosen.d.consultation_types[0] : rng() < 0.55 ? 'ONLINE' : 'IN_PERSON'
      const r = rng()
      let status
      if (day === 0 && rng() < 0.15) status = 'CONFIRMED'
      else status = r < 0.74 ? 'COMPLETED' : r < 0.85 ? 'CANCELLED' : type === 'ON_DEMAND' ? (r < 0.93 ? 'NO_DOCTOR_FOUND' : 'COMPLETED') : r < 0.92 ? 'REJECTED' : 'EXPIRED'
      const hasDoctor = !['NO_DOCTOR_FOUND', 'REJECTED', 'EXPIRED'].includes(status) && !(status === 'CANCELLED' && type === 'ON_DEMAND' && rng() < 0.5)
      seq++
      bookings.push({
        code: `MGH${String(seq).padStart(5, '0')}`, patient_id: p.id, doctor_id: hasDoctor ? chosen.d.id : null, specialty_id: specId[spec], type, consultation_type: ctype, status,
        patient_lat: p.latitude, patient_lng: p.longitude, address: null, algorithm: type === 'ON_DEMAND' ? 'multi' : null,
        search_radius_km: type === 'ON_DEMAND' ? 5 : null, matching_ms: type === 'ON_DEMAND' ? Math.round(between(0.2, 1.8) * 100) / 100 : null,
        distance_km: Math.round(chosen.dist * 1000) / 1000, fee: chosen.d.consultation_fee, is_simulated: true,
        scheduled_at: type === 'SCHEDULED' ? new Date(created.getTime() + intBetween(2, 30) * 3600000).toISOString() : null,
        created_at: created.toISOString(),
        accepted_at: hasDoctor ? new Date(created.getTime() + between(8, 70) * 1000).toISOString() : null,
        started_at: status === 'COMPLETED' ? new Date(created.getTime() + between(10, 40) * 60000).toISOString() : null,
        completed_at: status === 'COMPLETED' ? new Date(created.getTime() + between(35, 80) * 60000).toISOString() : null,
        cancelled_at: status === 'CANCELLED' ? new Date(created.getTime() + between(1, 30) * 60000).toISOString() : null,
        _doctor: chosen.d, _ranked: ranked, _patient: p,
      })
    }
  }

  // Lịch sử của bệnh nhân demo
  const demoPast = [
    { daysAgo: 12, doctor: demoDoctor, status: 'COMPLETED', review: 5, pay: 'SUCCESS', spec: 'tai-mui-hong' },
    { daysAgo: 3, doctor: approved.find((d) => d.specialty_id === specId['da-lieu'] && d.is_simulated), status: 'COMPLETED', review: null, pay: 'PENDING', spec: 'da-lieu' },
    { daysAgo: 20, doctor: approved.find((d) => d.specialty_id === specId['nhi-khoa'] && d.is_simulated), status: 'CANCELLED', spec: 'nhi-khoa' },
  ]
  demoPast.forEach((x, i) => {
    const created = vnDate(x.daysAgo, 9 + i * 3, 15, now)
    bookings.push({
      code: `MGD${String(i + 1).padStart(5, '0')}`, patient_id: demoPatient.id, doctor_id: x.doctor.id, specialty_id: specId[x.spec], type: i === 0 ? 'ON_DEMAND' : 'SCHEDULED',
      consultation_type: 'ONLINE', status: x.status, patient_lat: demoPatient.latitude, patient_lng: demoPatient.longitude, address: '78 Lê Duẩn, Hải Châu',
      algorithm: i === 0 ? 'multi' : null, search_radius_km: i === 0 ? 5 : null, matching_ms: i === 0 ? 0.64 : null,
      distance_km: haversineKm(demoPatient.latitude, demoPatient.longitude, x.doctor.latitude, x.doctor.longitude), fee: x.doctor.consultation_fee, is_simulated: true,
      scheduled_at: i === 0 ? null : created.toISOString(), created_at: new Date(created.getTime() - 86400000).toISOString(),
      accepted_at: created.toISOString(), started_at: x.status === 'COMPLETED' ? created.toISOString() : null,
      completed_at: x.status === 'COMPLETED' ? new Date(created.getTime() + 25 * 60000).toISOString() : null,
      cancelled_at: x.status === 'CANCELLED' ? created.toISOString() : null,
      symptoms: i === 0 ? 'Đau họng, hắt hơi 2 ngày nay' : i === 1 ? 'Nổi mẩn đỏ ở cánh tay' : 'Bé bị ho nhẹ',
      _doctor: x.doctor, _patient: demoPatient, _demo: x,
    })
  })

  const bCols = {
    code: 'text', patient_id: 'int', doctor_id: 'int', specialty_id: 'int', type: 'text', consultation_type: 'text', status: 'text', patient_lat: 'float8', patient_lng: 'float8',
    address: 'text', symptoms: 'text', algorithm: 'text', search_radius_km: 'real', matching_ms: 'real', distance_km: 'real', fee: 'int', is_simulated: 'boolean',
    scheduled_at: 'timestamptz', created_at: 'timestamptz', updated_at: 'timestamptz', accepted_at: 'timestamptz', started_at: 'timestamptz', completed_at: 'timestamptz', cancelled_at: 'timestamptz',
  }
  const bRows = await bulkInsert('bookings', bCols, bookings.map((b) => {
    const o = {}
    for (const k of Object.keys(bCols)) o[k] = b[k] ?? null
    o.updated_at = b.completed_at || b.cancelled_at || b.accepted_at || b.created_at
    return o
  }), { returning: 'id, code' })
  const bid = Object.fromEntries(bRows.map((r) => [r.code, r.id]))
  bookings.forEach((b) => (b.id = bid[b.code]))

  // booking_requests: mô phỏng lịch sử dispatch (các lần từ chối/hết hạn trước khi có người nhận)
  const reqRows = []
  const logRows = []
  for (const b of bookings) {
    logRows.push({ booking_id: b.id, from_status: null, to_status: 'PENDING', note: b.type === 'ON_DEMAND' ? 'Người bệnh gửi yêu cầu khám ngay' : 'Người bệnh đặt lịch', created_at: b.created_at })
    if (b.type === 'ON_DEMAND') {
      const others = (b._ranked || []).filter((x) => x.d.id !== b._doctor.id).slice(0, 4)
      const fails = b.status === 'NO_DOCTOR_FOUND' ? Math.min(others.length, intBetween(2, 4)) : rng() < 0.62 ? 0 : Math.min(others.length, intBetween(1, 2))
      let t = new Date(b.created_at).getTime() + 1500
      for (let i = 0; i < fails; i++) {
        const expired = rng() < 0.35
        const ms = expired ? 30000 : Math.round(between(3000, 15000))
        reqRows.push({ booking_id: b.id, doctor_id: others[i].d.id, rank: i + 1, score: Math.round(between(60, 92) * 10) / 10, distance_km: others[i].dist, status: expired ? 'EXPIRED' : 'REJECTED', offered_at: new Date(t).toISOString(), expires_at: new Date(t + 30000).toISOString(), responded_at: new Date(t + ms).toISOString(), response_ms: ms })
        t += ms + 400
      }
      if (b.doctor_id) {
        const ms = Math.round(between(2500, 14000))
        reqRows.push({ booking_id: b.id, doctor_id: b.doctor_id, rank: fails + 1, score: Math.round(between(70, 96) * 10) / 10, distance_km: b.distance_km, status: 'ACCEPTED', offered_at: new Date(t).toISOString(), expires_at: new Date(t + 30000).toISOString(), responded_at: new Date(t + ms).toISOString(), response_ms: ms })
      }
    } else if (b.doctor_id || ['REJECTED', 'EXPIRED'].includes(b.status)) {
      const doc = b.doctor_id || b._doctor.id
      const st = b.status === 'REJECTED' ? 'REJECTED' : b.status === 'EXPIRED' ? 'EXPIRED' : b.status === 'CANCELLED' ? 'CANCELLED' : 'ACCEPTED'
      const ms = Math.round(between(60000, 3600000))
      reqRows.push({ booking_id: b.id, doctor_id: doc, rank: 1, score: null, distance_km: b.distance_km, status: st, offered_at: b.created_at, expires_at: new Date(new Date(b.created_at).getTime() + 12 * 3600000).toISOString(), responded_at: new Date(new Date(b.created_at).getTime() + ms).toISOString(), response_ms: ms })
    }
    const final = b.status
    if (final !== 'PENDING') logRows.push({ booking_id: b.id, from_status: null, to_status: final, note: 'Dữ liệu lịch sử mô phỏng', created_at: b.completed_at || b.cancelled_at || b.accepted_at || b.created_at })
  }
  await bulkInsert('booking_requests', { booking_id: 'int', doctor_id: 'int', rank: 'int', score: 'real', distance_km: 'real', status: 'text', offered_at: 'timestamptz', expires_at: 'timestamptz', responded_at: 'timestamptz', response_ms: 'int' }, reqRows, { returning: '' })
  await bulkInsert('booking_status_logs', { booking_id: 'int', from_status: 'text', to_status: 'text', note: 'text', created_at: 'timestamptz' }, logRows, { returning: '' })

  // Consultations, notes, reviews, payments
  const completed = bookings.filter((b) => b.status === 'COMPLETED')
  await bulkInsert('consultations', { booking_id: 'int', started_at: 'timestamptz', ended_at: 'timestamptz', mode: 'text' }, completed.map((b) => ({ booking_id: b.id, started_at: b.started_at, ended_at: b.completed_at, mode: b.consultation_type })), { returning: '' })
  await bulkInsert('medical_notes', { booking_id: 'int', doctor_id: 'int', notes: 'text', advice: 'text', follow_up: 'text', created_at: 'timestamptz' }, completed.map((b) => ({
    booking_id: b.id, doctor_id: b.doctor_id, created_at: b.completed_at,
    notes: '[Dữ liệu mô phỏng] Đã trao đổi về triệu chứng và tiền sử của người bệnh.',
    advice: 'Nghỉ ngơi, uống đủ nước, ăn uống điều độ. Theo dõi thêm các triệu chứng.',
    follow_up: rng() < 0.4 ? 'Tái khám sau 1 tuần' : 'Tái khám khi có triệu chứng bất thường',
  })), { returning: '' })

  const reviewRows = []
  for (const b of completed) {
    if (b._demo) {
      if (b._demo.review) reviewRows.push({ booking_id: b.id, patient_id: b.patient_id, doctor_id: b.doctor_id, rating: b._demo.review, comment: 'Bác sĩ khám kỹ, hướng dẫn rất dễ hiểu.', created_at: b.completed_at })
      continue
    }
    if (rng() > 0.78) continue
    const qv = b._doctor.quality + (rng() - 0.5) * 1.6 - (b.distance_km > 6 ? 0.4 : 0)
    const rating = Math.max(1, Math.min(5, Math.round(qv)))
    reviewRows.push({ booking_id: b.id, patient_id: b.patient_id, doctor_id: b.doctor_id, rating, comment: rng() < 0.75 ? pick(COMMENTS[rating]) : null, created_at: new Date(new Date(b.completed_at).getTime() + 3600000).toISOString() })
  }
  await bulkInsert('reviews', { booking_id: 'int', patient_id: 'int', doctor_id: 'int', rating: 'int', comment: 'text', created_at: 'timestamptz' }, reviewRows, { returning: '' })

  const METHODS = ['CASH', 'BANK_TRANSFER', 'MOCK_PAYMENT']
  await bulkInsert('payments', { booking_id: 'int', amount: 'int', method: 'text', status: 'text', transaction_ref: 'text', paid_at: 'timestamptz', created_at: 'timestamptz' },
    completed.map((b) => {
      const st = b._demo ? b._demo.pay : rng() < 0.96 ? 'SUCCESS' : rng() < 0.5 ? 'FAILED' : 'REFUNDED'
      return { booking_id: b.id, amount: b.fee, method: b._demo && st === 'PENDING' ? 'CASH' : pick(METHODS), status: st, transaction_ref: st === 'PENDING' ? null : `MOCK${b.id}${Math.floor(rng() * 1e6)}`, paid_at: st === 'SUCCESS' ? b.completed_at : null, created_at: b.completed_at }
    }), { returning: '' })

  // Cập nhật rating trung bình (sẽ được Matching Engine sử dụng)
  await q(`UPDATE doctors d SET rating = s.avg, total_reviews = s.cnt FROM (
             SELECT doctor_id, ROUND(AVG(rating)::numeric, 2)::real AS avg, COUNT(*)::int AS cnt FROM reviews WHERE status = 'VISIBLE' GROUP BY doctor_id) s
           WHERE s.doctor_id = d.id`)

  // Hội thoại mẫu giữa bệnh nhân demo và bác sĩ demo
  const demoBooking = bookings.find((b) => b.code === 'MGD00001')
  const t = new Date(demoBooking.accepted_at).getTime()
  const demoMsgs = [
    { senderId: null, type: 'SYSTEM', content: 'BS. Trần Minh Khoa đã nhận lịch khám. Hai bên có thể nhắn tin tại đây.', at: t },
    { senderId: uid['patient@demo.vn'], type: 'TEXT', content: 'Chào bác sĩ, em bị đau họng và hắt hơi 2 ngày nay ạ.', at: t + 60000 },
    { senderId: uid['doctor@demo.vn'], type: 'TEXT', content: 'Chào em, em có sốt không? Mình gọi video để bác sĩ xem họng nhé.', at: t + 120000 },
    { senderId: uid['patient@demo.vn'], type: 'TEXT', content: 'Dạ em không sốt ạ. Em sẵn sàng rồi.', at: t + 180000 },
  ]
  const convRows = [{
    id: demoBooking.id, created_at: new Date(t).toISOString(), last_message_at: new Date(t + 180000).toISOString(),
    last_message: { content: demoMsgs[3].content, type: 'TEXT', sender_id: demoMsgs[3].senderId, created_at: new Date(t + 180000).toISOString() },
  }]
  const partRows = [
    { conversation_id: demoBooking.id, user_id: uid['patient@demo.vn'], last_read_at: now.toISOString() },
    { conversation_id: demoBooking.id, user_id: uid['doctor@demo.vn'], last_read_at: now.toISOString() },
  ]
  const msgRows = demoMsgs.map((m) => ({ conversation_id: demoBooking.id, sender_id: m.senderId, type: m.type, content: m.content, created_at: new Date(m.at).toISOString() }))

  // Lịch sắp tới của bác sĩ demo: 2 lịch đã xác nhận + 1 yêu cầu chờ xác nhận + 1 lịch của bệnh nhân demo
  const upcoming = await q(`SELECT id, start_at FROM appointment_slots WHERE doctor_id = $1 AND status = 'AVAILABLE' AND start_at > now() + interval '40 minutes' ORDER BY start_at LIMIT 8`, [demoDoctor.id])
  const pickSlots = [upcoming[0], upcoming[2], upcoming[4], upcoming[6]].filter(Boolean)
  const upRows = pickSlots.map((s, i) => {
    const p = i === 3 ? demoPatient : simPatients[i * 7]
    return {
      code: `MGU${String(i + 1).padStart(5, '0')}`, patient_id: p.id, doctor_id: demoDoctor.id, specialty_id: specId['tai-mui-hong'], type: 'SCHEDULED', consultation_type: i === 1 ? 'IN_PERSON' : 'ONLINE',
      status: i === 2 ? 'OFFERED' : 'CONFIRMED', slot_id: s.id, scheduled_at: s.start_at, patient_lat: p.latitude, patient_lng: p.longitude, fee: demoDoctor.consultation_fee,
      distance_km: haversineKm(p.latitude, p.longitude, demoDoctor.latitude, demoDoctor.longitude), symptoms: ['Viêm xoang tái phát', 'Ù tai bên trái', 'Khàn tiếng 1 tuần', 'Nghẹt mũi về đêm'][i],
      accepted_at: i === 2 ? null : now.toISOString(), is_simulated: i !== 3,
    }
  })
  const upIns = await bulkInsert('bookings', { code: 'text', patient_id: 'int', doctor_id: 'int', specialty_id: 'int', type: 'text', consultation_type: 'text', status: 'text', slot_id: 'int', scheduled_at: 'timestamptz', patient_lat: 'float8', patient_lng: 'float8', fee: 'int', distance_km: 'real', symptoms: 'text', accepted_at: 'timestamptz', is_simulated: 'boolean' }, upRows, { returning: 'id, code, slot_id, status, scheduled_at' })
  await q(`UPDATE appointment_slots s SET status = 'BOOKED', booking_id = b.id FROM bookings b WHERE b.slot_id = s.id AND b.code LIKE 'MGU%'`)
  await bulkInsert('booking_requests', { booking_id: 'int', doctor_id: 'int', rank: 'int', status: 'text', expires_at: 'timestamptz', responded_at: 'timestamptz' },
    upIns.map((b) => ({ booking_id: b.id, doctor_id: demoDoctor.id, rank: 1, status: b.status === 'OFFERED' ? 'OFFERED' : 'ACCEPTED', expires_at: b.scheduled_at, responded_at: b.status === 'OFFERED' ? null : now.toISOString() })), { returning: '' })
  await bulkInsert('booking_status_logs', { booking_id: 'int', from_status: 'text', to_status: 'text', note: 'text' }, upIns.flatMap((b) => [
    { booking_id: b.id, from_status: null, to_status: 'PENDING', note: 'Người bệnh đặt lịch' },
    { booking_id: b.id, from_status: 'PENDING', to_status: 'OFFERED', note: 'Chờ bác sĩ xác nhận' },
    ...(b.status === 'CONFIRMED' ? [{ booking_id: b.id, from_status: 'OFFERED', to_status: 'ACCEPTED', note: 'Bác sĩ chấp nhận' }, { booking_id: b.id, from_status: 'ACCEPTED', to_status: 'CONFIRMED', note: 'Hệ thống xác nhận lịch khám' }] : []),
  ]), { returning: '' })
  // Phòng chat cho các lịch đã xác nhận
  for (const b of upIns.filter((x) => x.status === 'CONFIRMED')) {
    const row = upRows.find((r) => r.code === b.code)
    const pu = pRows.find((p) => p.id === row.patient_id).user_id
    const content = 'Lịch khám đã được xác nhận. Hai bên có thể nhắn tin tại đây.'
    convRows.push({ id: b.id, created_at: now.toISOString(), last_message_at: now.toISOString(), last_message: { content, type: 'SYSTEM', sender_id: null, created_at: now.toISOString() } })
    partRows.push({ conversation_id: b.id, user_id: pu, last_read_at: null }, { conversation_id: b.id, user_id: uid['doctor@demo.vn'], last_read_at: null })
    msgRows.push({ conversation_id: b.id, sender_id: null, type: 'SYSTEM', content, created_at: now.toISOString() })
  }
  await bulkInsert('conversations', { id: 'int', created_at: 'timestamptz', last_message_at: 'timestamptz', last_message: 'jsonb' }, convRows, { returning: '' })
  await bulkInsert('participants', { conversation_id: 'int', user_id: 'int', last_read_at: 'timestamptz' }, partRows, { returning: '' })
  await bulkInsert('messages', { conversation_id: 'int', sender_id: 'int', type: 'text', content: 'text', created_at: 'timestamptz' }, msgRows, { returning: '' })

  // Khiếu nại mẫu
  const cRows = [
    { reporter_id: simPatients[3].user_id, target_type: 'DOCTOR', doctor_id: approved[8].id, title: 'Bác sĩ đến trễ 20 phút', description: 'Lịch hẹn 9:00 nhưng 9:20 bác sĩ mới gọi video.', status: 'OPEN' },
    { reporter_id: simPatients[11].user_id, target_type: 'PAYMENT', title: 'Thanh toán bị trừ 2 lần', description: 'Tôi chuyển khoản và bị ghi nhận 2 giao dịch.', status: 'PROCESSING' },
    { reporter_id: simPatients[25].user_id, target_type: 'SERVICE', title: 'Ứng dụng báo không tìm thấy bác sĩ', description: 'Buổi tối tìm Nhi khoa trong 5 km không có ai.', status: 'RESOLVED', admin_note: 'Đã bổ sung lịch trực tối cho bác sĩ Nhi khoa.' },
    { reporter_id: simPatients[40].user_id, target_type: 'BOOKING', title: 'Không hủy được lịch', description: 'Bấm hủy lịch nhưng không phản hồi.', status: 'REJECTED', admin_note: 'Lịch đã ở trạng thái IN_PROGRESS nên không thể hủy.' },
  ]
  await bulkInsert('complaints', { reporter_id: 'int', target_type: 'text', doctor_id: 'int', title: 'text', description: 'text', status: 'text', admin_note: 'text' }, cRows.map((c) => ({ doctor_id: null, admin_note: null, ...c })), { returning: '' })

  // Thông báo mẫu
  notifySync([
    { userId: uid['patient@demo.vn'], type: 'CONSULTATION_COMPLETED', title: 'Phiên khám da liễu đã hoàn thành', body: 'Hãy thanh toán và đánh giá bác sĩ.', data: { bookingId: bid.MGD00002 } },
    { userId: uid['doctor@demo.vn'], type: 'NEW_BOOKING_REQUEST', title: 'Lịch hẹn mới cần xác nhận', body: 'Có 1 lịch hẹn đang chờ bạn xác nhận.', data: {} },
    { userId: uid['admin@demo.vn'], type: 'DOCTOR_PENDING', title: '4 hồ sơ bác sĩ chờ duyệt', body: 'Vào mục Bác sĩ để xét duyệt.', data: {} },
    { userId: uid['admin@demo.vn'], type: 'SYSTEM', title: 'Đã khởi tạo dữ liệu mô phỏng', body: 'Dữ liệu Đà Nẵng giả lập – không chứa thông tin y tế thật.', data: {} },
  ])
  await batch.flush()

  // Đánh dấu seed hoàn tất
  await q(`INSERT INTO app_meta (key, value) VALUES ('seeded', $1::jsonb) ON CONFLICT (key) DO NOTHING`, [JSON.stringify({ at: now })])
  console.log(`[seed] xong: ${users.length} users, ${doctors.length} bác sĩ, ${bookings.length + upIns.length} booking, ${reviewRows.length} review (${Date.now() - t0}ms)`)
}

module.exports = { seed, SPECIALTIES, mulberry32 }
