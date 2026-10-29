/**
 * Sinh slot khám từ lịch làm việc (doctor_schedules) cho N ngày tới.
 * Thời gian được hiểu theo giờ Việt Nam rồi lưu thành timestamptz.
 * ON CONFLICT (doctor_id, start_at) DO NOTHING → chạy lại nhiều lần an toàn, không tạo trùng.
 */
const { q } = require('./db')

async function generateSlots({ days = 7, doctorId = null } = {}) {
  const rows = await q(
    `INSERT INTO appointment_slots (doctor_id, start_at, end_at, status)
     SELECT s.doctor_id,
            ((d::date + s.start_time::time) + (n * s.slot_minutes) * interval '1 minute') AT TIME ZONE 'Asia/Ho_Chi_Minh',
            ((d::date + s.start_time::time) + ((n + 1) * s.slot_minutes) * interval '1 minute') AT TIME ZONE 'Asia/Ho_Chi_Minh',
            'AVAILABLE'
     FROM doctor_schedules s
     CROSS JOIN generate_series((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
                                (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + $1::int, interval '1 day') d
     CROSS JOIN LATERAL generate_series(0, (EXTRACT(EPOCH FROM (s.end_time::time - s.start_time::time)) / 60 / s.slot_minutes)::int - 1) n
     WHERE s.is_active AND EXTRACT(DOW FROM d) = s.day_of_week AND ($2::int IS NULL OR s.doctor_id = $2::int)
     ON CONFLICT (doctor_id, start_at) DO NOTHING
     RETURNING id`,
    [days, doctorId],
  )
  return rows.length
}

/** Khi bác sĩ đổi lịch: xóa slot trống trong tương lai rồi sinh lại (giữ nguyên slot đã đặt/khóa) */
async function rebuildSlots(doctorId) {
  await q(`DELETE FROM appointment_slots WHERE doctor_id = $1 AND status = 'AVAILABLE' AND start_at > now()`, [doctorId])
  return generateSlots({ doctorId })
}

module.exports = { generateSlots, rebuildSlots }
