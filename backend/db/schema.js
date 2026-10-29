/**
 * MediGo – Database schema (PostgreSQL, Drizzle ORM declarations).
 *
 * Quy ước:
 *  - Tên bảng/cột snake_case, khóa chính serial.
 *  - Mọi mốc thời gian dùng timestamptz (lưu UTC, hiển thị theo Asia/Ho_Chi_Minh).
 *  - Trạng thái (enum) lưu dạng text + CHECK constraint để dễ mở rộng.
 *  - Soft delete bằng deleted_at cho users / specialties / clinics.
 *
 * Bảng chính của nghiên cứu: doctors (vị trí + trạng thái), bookings (state machine),
 * booking_requests (lịch sử dispatch từng bác sĩ).
 * Toàn bộ dữ liệu nằm trong một cơ sở dữ liệu PostgreSQL duy nhất. Dữ liệu ghi nhiều (thông báo,
 * nhật ký điều phối, lịch sử vị trí, số đo API) được ghi theo lô – xem lib/batch.js.
 */
const { sql } = require('drizzle-orm')
const {
  pgTable, serial, integer, text, boolean, timestamp, doublePrecision, real, jsonb, date,
  index, uniqueIndex, unique, check,
} = require('drizzle-orm/pg-core')

const ts = (name) => timestamp(name, { withTimezone: true })
const createdAt = () => ts('created_at').defaultNow().notNull()
const updatedAt = () => ts('updated_at').defaultNow().notNull()

// ───────────────────────── Auth / users ─────────────────────────
exports.roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // PATIENT | DOCTOR | ADMIN
  description: text('description'),
})

exports.users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  phone: text('phone'),
  password_hash: text('password_hash').notNull(),
  role: text('role').notNull(),
  full_name: text('full_name').notNull(),
  avatar: text('avatar'),
  is_active: boolean('is_active').default(true).notNull(),
  email_verified: boolean('email_verified').default(false).notNull(),
  reset_code: text('reset_code'),
  reset_expires_at: ts('reset_expires_at'),
  last_login_at: ts('last_login_at'),
  created_at: createdAt(),
  updated_at: updatedAt(),
  deleted_at: ts('deleted_at'),
}, (t) => [
  uniqueIndex('users_email_uq').on(t.email),
  index('users_role_idx').on(t.role),
  check('users_role_chk', sql`${t.role} in ('PATIENT','DOCTOR','ADMIN')`),
])

exports.refresh_tokens = pgTable('refresh_tokens', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
  token_hash: text('token_hash').notNull(),
  expires_at: ts('expires_at').notNull(),
  revoked_at: ts('revoked_at'),
  created_at: createdAt(),
}, (t) => [
  uniqueIndex('refresh_tokens_hash_uq').on(t.token_hash),
  index('refresh_tokens_user_idx').on(t.user_id),
])

// ───────────────────────── Profiles ─────────────────────────
exports.patients = pgTable('patients', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
  date_of_birth: date('date_of_birth'),
  gender: text('gender'), // MALE | FEMALE | OTHER
  address: text('address'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  is_simulated: boolean('is_simulated').default(false).notNull(),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, (t) => [uniqueIndex('patients_user_uq').on(t.user_id)])

exports.specialties = pgTable('specialties', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  icon: text('icon'),
  related: jsonb('related').default([]), // slug các chuyên khoa liên quan (dùng cho SpecialtyScore = 0.3)
  status: text('status').default('ACTIVE').notNull(),
  created_at: createdAt(),
  deleted_at: ts('deleted_at'),
}, (t) => [
  uniqueIndex('specialties_slug_uq').on(t.slug),
  check('specialties_status_chk', sql`${t.status} in ('ACTIVE','INACTIVE')`),
])

exports.clinics = pgTable('clinics', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  district: text('district'),
  phone: text('phone'),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  status: text('status').default('ACTIVE').notNull(),
  created_at: createdAt(),
  deleted_at: ts('deleted_at'),
}, (t) => [index('clinics_lat_lng_idx').on(t.latitude, t.longitude)])

exports.doctors = pgTable('doctors', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
  specialty_id: integer('specialty_id').references(() => exports.specialties.id),
  clinic_id: integer('clinic_id').references(() => exports.clinics.id),
  license_number: text('license_number'),
  experience_years: integer('experience_years').default(0).notNull(),
  education: text('education'),
  description: text('description'),
  consultation_fee: integer('consultation_fee').default(200000).notNull(), // VND
  consultation_types: jsonb('consultation_types').default(['ONLINE', 'IN_PERSON']),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  location_updated_at: ts('location_updated_at'),
  rating: real('rating').default(0).notNull(),
  total_reviews: integer('total_reviews').default(0).notNull(),
  status: text('status').default('OFFLINE').notNull(),
  availability: text('availability').default('UNAVAILABLE').notNull(),
  verification_status: text('verification_status').default('PENDING').notNull(),
  verification_note: text('verification_note'),
  // Bác sĩ mô phỏng: tự phản hồi yêu cầu với xác suất accept_prob (phục vụ demo dispatch)
  is_simulated: boolean('is_simulated').default(false).notNull(),
  accept_prob: real('accept_prob').default(0.75).notNull(),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, (t) => [
  uniqueIndex('doctors_user_uq').on(t.user_id),
  index('doctors_lat_lng_idx').on(t.latitude, t.longitude),
  index('doctors_dispatch_idx').on(t.status, t.availability, t.verification_status),
  index('doctors_specialty_idx').on(t.specialty_id),
  check('doctors_status_chk', sql`${t.status} in ('OFFLINE','ONLINE','BUSY')`),
  check('doctors_availability_chk', sql`${t.availability} in ('AVAILABLE','UNAVAILABLE')`),
  check('doctors_verification_chk', sql`${t.verification_status} in ('PENDING','APPROVED','REJECTED')`),
  check('doctors_fee_chk', sql`${t.consultation_fee} >= 0`),
])

exports.doctor_specialties = pgTable('doctor_specialties', {
  id: serial('id').primaryKey(),
  doctor_id: integer('doctor_id').notNull().references(() => exports.doctors.id, { onDelete: 'cascade' }),
  specialty_id: integer('specialty_id').notNull().references(() => exports.specialties.id),
  is_primary: boolean('is_primary').default(false).notNull(),
}, (t) => [
  unique('doctor_specialties_uq').on(t.doctor_id, t.specialty_id),
  index('doctor_specialties_spec_idx').on(t.specialty_id),
])

// ───────────────────────── Schedule ─────────────────────────
exports.doctor_schedules = pgTable('doctor_schedules', {
  id: serial('id').primaryKey(),
  doctor_id: integer('doctor_id').notNull().references(() => exports.doctors.id, { onDelete: 'cascade' }),
  day_of_week: integer('day_of_week').notNull(), // 0 = Chủ nhật … 6 = Thứ bảy
  start_time: text('start_time').notNull(), // 'HH:MM'
  end_time: text('end_time').notNull(),
  slot_minutes: integer('slot_minutes').default(30).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: createdAt(),
}, (t) => [
  index('doctor_schedules_doctor_idx').on(t.doctor_id),
  check('doctor_schedules_dow_chk', sql`${t.day_of_week} between 0 and 6`),
  check('doctor_schedules_time_chk', sql`${t.start_time} < ${t.end_time}`),
])

/** Slot khám. UNIQUE(doctor_id, start_at) + cập nhật nguyên tử chống double booking. */
exports.appointment_slots = pgTable('appointment_slots', {
  id: serial('id').primaryKey(),
  doctor_id: integer('doctor_id').notNull().references(() => exports.doctors.id, { onDelete: 'cascade' }),
  start_at: ts('start_at').notNull(),
  end_at: ts('end_at').notNull(),
  status: text('status').default('AVAILABLE').notNull(),
  booking_id: integer('booking_id'),
  created_at: createdAt(),
}, (t) => [
  unique('appointment_slots_doctor_start_uq').on(t.doctor_id, t.start_at),
  index('appointment_slots_lookup_idx').on(t.doctor_id, t.status, t.start_at),
  check('appointment_slots_status_chk', sql`${t.status} in ('AVAILABLE','BOOKED','BLOCKED')`),
])

// ───────────────────────── Booking / dispatch ─────────────────────────
exports.bookings = pgTable('bookings', {
  id: serial('id').primaryKey(),
  code: text('code').notNull(),
  patient_id: integer('patient_id').notNull().references(() => exports.patients.id),
  doctor_id: integer('doctor_id').references(() => exports.doctors.id),
  specialty_id: integer('specialty_id').references(() => exports.specialties.id),
  type: text('type').notNull(), // SCHEDULED | ON_DEMAND
  consultation_type: text('consultation_type').notNull(), // ONLINE | IN_PERSON
  status: text('status').default('PENDING').notNull(),
  slot_id: integer('slot_id').references(() => exports.appointment_slots.id),
  scheduled_at: ts('scheduled_at'),
  patient_lat: doublePrecision('patient_lat'),
  patient_lng: doublePrecision('patient_lng'),
  address: text('address'),
  symptoms: text('symptoms'),
  // Matching
  algorithm: text('algorithm'), // random | nearest | multi
  weights: jsonb('weights'),
  search_radius_km: real('search_radius_km'),
  candidates: jsonb('candidates'), // danh sách xếp hạng kèm điểm thành phần
  matching_ms: real('matching_ms'),
  distance_km: real('distance_km'),
  fee: integer('fee'),
  cancel_reason: text('cancel_reason'),
  is_simulated: boolean('is_simulated').default(false).notNull(),
  accepted_at: ts('accepted_at'),
  started_at: ts('started_at'),
  completed_at: ts('completed_at'),
  cancelled_at: ts('cancelled_at'),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, (t) => [
  uniqueIndex('bookings_code_uq').on(t.code),
  index('bookings_status_idx').on(t.status),
  index('bookings_patient_idx').on(t.patient_id, t.created_at),
  index('bookings_doctor_idx').on(t.doctor_id, t.created_at),
  index('bookings_created_idx').on(t.created_at),
  check('bookings_type_chk', sql`${t.type} in ('SCHEDULED','ON_DEMAND')`),
  check('bookings_ctype_chk', sql`${t.consultation_type} in ('ONLINE','IN_PERSON')`),
  check('bookings_status_chk', sql`${t.status} in ('PENDING','SEARCHING','OFFERED','ACCEPTED','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED','REJECTED','EXPIRED','NO_DOCTOR_FOUND')`),
])

/** Mỗi lần hệ thống gửi yêu cầu cho một bác sĩ (dispatch offer). */
exports.booking_requests = pgTable('booking_requests', {
  id: serial('id').primaryKey(),
  booking_id: integer('booking_id').notNull().references(() => exports.bookings.id, { onDelete: 'cascade' }),
  doctor_id: integer('doctor_id').notNull().references(() => exports.doctors.id),
  rank: integer('rank').notNull(),
  score: real('score'),
  distance_km: real('distance_km'),
  status: text('status').default('OFFERED').notNull(),
  offered_at: ts('offered_at').defaultNow().notNull(),
  expires_at: ts('expires_at').notNull(),
  responded_at: ts('responded_at'),
  response_ms: integer('response_ms'),
  reason: text('reason'),
}, (t) => [
  index('booking_requests_doctor_idx').on(t.doctor_id, t.status),
  index('booking_requests_expiry_idx').on(t.status, t.expires_at),
  index('booking_requests_booking_idx').on(t.booking_id),
  check('booking_requests_status_chk', sql`${t.status} in ('OFFERED','ACCEPTED','REJECTED','EXPIRED','CANCELLED')`),
])

/** Nhật ký chuyển trạng thái (audit cho state machine) */
exports.booking_status_logs = pgTable('booking_status_logs', {
  id: serial('id').primaryKey(),
  booking_id: integer('booking_id').notNull().references(() => exports.bookings.id, { onDelete: 'cascade' }),
  from_status: text('from_status'),
  to_status: text('to_status').notNull(),
  actor_id: integer('actor_id'),
  note: text('note'),
  created_at: createdAt(),
}, (t) => [index('booking_status_logs_booking_idx').on(t.booking_id, t.created_at)])

// ───────────────────────── Consultation ─────────────────────────
exports.consultations = pgTable('consultations', {
  id: serial('id').primaryKey(),
  booking_id: integer('booking_id').notNull().references(() => exports.bookings.id, { onDelete: 'cascade' }),
  started_at: ts('started_at').defaultNow().notNull(),
  ended_at: ts('ended_at'),
  mode: text('mode'),
}, (t) => [uniqueIndex('consultations_booking_uq').on(t.booking_id)])

exports.medical_notes = pgTable('medical_notes', {
  id: serial('id').primaryKey(),
  booking_id: integer('booking_id').notNull().references(() => exports.bookings.id, { onDelete: 'cascade' }),
  doctor_id: integer('doctor_id').notNull().references(() => exports.doctors.id),
  notes: text('notes'),
  advice: text('advice'),
  follow_up: text('follow_up'),
  created_at: createdAt(),
}, (t) => [uniqueIndex('medical_notes_booking_uq').on(t.booking_id)])

// ───────────────────────── Payment / review ─────────────────────────
exports.payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  booking_id: integer('booking_id').notNull().references(() => exports.bookings.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  method: text('method').notNull(),
  status: text('status').default('PENDING').notNull(),
  transaction_ref: text('transaction_ref'),
  paid_at: ts('paid_at'),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, (t) => [
  uniqueIndex('payments_booking_uq').on(t.booking_id),
  index('payments_status_idx').on(t.status),
  check('payments_method_chk', sql`${t.method} in ('CASH','BANK_TRANSFER','MOCK_PAYMENT')`),
  check('payments_status_chk', sql`${t.status} in ('PENDING','SUCCESS','FAILED','REFUNDED')`),
  check('payments_amount_chk', sql`${t.amount} >= 0`),
])

exports.reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  booking_id: integer('booking_id').notNull().references(() => exports.bookings.id, { onDelete: 'cascade' }),
  patient_id: integer('patient_id').notNull().references(() => exports.patients.id),
  doctor_id: integer('doctor_id').notNull().references(() => exports.doctors.id),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  status: text('status').default('VISIBLE').notNull(),
  created_at: createdAt(),
}, (t) => [
  uniqueIndex('reviews_booking_uq').on(t.booking_id), // 1 booking chỉ review 1 lần
  index('reviews_doctor_idx').on(t.doctor_id, t.created_at),
  check('reviews_rating_chk', sql`${t.rating} between 1 and 5`),
  check('reviews_status_chk', sql`${t.status} in ('VISIBLE','HIDDEN')`),
])

// ───────────────────────── Chat ─────────────────────────
/** Phòng chat: 1 phòng / booking → khóa chính chính là booking_id */
exports.conversations = pgTable('conversations', {
  id: integer('id').primaryKey().references(() => exports.bookings.id, { onDelete: 'cascade' }),
  last_message_at: ts('last_message_at'),
  last_message: jsonb('last_message'), // { content, type, sender_id, created_at } – hiển thị nhanh danh sách
  created_at: createdAt(),
}, (t) => [index('conversations_last_idx').on(t.last_message_at)])

exports.participants = pgTable('participants', {
  id: serial('id').primaryKey(),
  conversation_id: integer('conversation_id').notNull().references(() => exports.conversations.id, { onDelete: 'cascade' }),
  user_id: integer('user_id').notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
  last_read_at: ts('last_read_at'),
}, (t) => [
  unique('participants_uq').on(t.conversation_id, t.user_id),
  index('participants_user_idx').on(t.user_id),
])

exports.messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversation_id: integer('conversation_id').notNull().references(() => exports.conversations.id, { onDelete: 'cascade' }),
  sender_id: integer('sender_id').references(() => exports.users.id),
  type: text('type').default('TEXT').notNull(),
  content: text('content').notNull(),
  created_at: createdAt(),
}, (t) => [
  index('messages_conversation_idx').on(t.conversation_id, t.created_at),
  check('messages_type_chk', sql`${t.type} in ('TEXT','SYSTEM')`),
])

// ───────────────────────── Thông báo ─────────────────────────
/** id dạng text (UUID do ứng dụng sinh) → thông báo được đẩy real-time trước khi ghi theo lô */
exports.notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  data: jsonb('data'),
  read_at: ts('read_at'),
  created_at: createdAt(),
}, (t) => [
  index('notifications_user_idx').on(t.user_id, t.created_at),
  index('notifications_unread_idx').on(t.user_id, t.read_at),
])

// ───────────────────────── Nghiên cứu & vận hành ─────────────────────────
/** Lịch sử vị trí bác sĩ (mỗi lần chia sẻ vị trí) */
exports.doctor_locations = pgTable('doctor_locations', {
  id: serial('id').primaryKey(),
  doctor_id: integer('doctor_id').notNull().references(() => exports.doctors.id, { onDelete: 'cascade' }),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  source: text('source'),
  recorded_at: ts('recorded_at').defaultNow().notNull(),
}, (t) => [
  index('doctor_locations_doctor_idx').on(t.doctor_id, t.recorded_at),
  index('doctor_locations_lat_lng_idx').on(t.latitude, t.longitude),
])

/** Nhật ký điều phối: OFFERED / ACCEPTED / REJECTED / EXPIRED / NO_DOCTOR_FOUND / CANCELLED_BY_PATIENT */
exports.dispatch_events = pgTable('dispatch_events', {
  id: serial('id').primaryKey(),
  booking_id: integer('booking_id').notNull().references(() => exports.bookings.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  doctor_id: integer('doctor_id'),
  rank: integer('rank'),
  score: real('score'),
  distance_km: real('distance_km'),
  response_ms: integer('response_ms'),
  data: jsonb('data'), // thông tin bổ sung: thuật toán, điểm thành phần, lý do…
  at: ts('at').defaultNow().notNull(),
}, (t) => [
  index('dispatch_events_booking_idx').on(t.booking_id, t.at),
  index('dispatch_events_event_idx').on(t.event, t.at),
])

/** Kết quả thực nghiệm NCKH */
exports.experiment_runs = pgTable('experiment_runs', {
  id: serial('id').primaryKey(),
  experiment: text('experiment').notNull(),
  params: jsonb('params').notNull(),
  results: jsonb('results').notNull(),
  duration_ms: integer('duration_ms'),
  created_by: integer('created_by'),
  created_at: createdAt(),
}, (t) => [index('experiment_runs_created_idx').on(t.created_at)])

/** Thời gian phản hồi API (KPI "API Response Time"), giữ 30 ngày */
exports.api_metrics = pgTable('api_metrics', {
  id: serial('id').primaryKey(),
  route: text('route').notNull(),
  status: integer('status').notNull(),
  ms: integer('ms').notNull(),
  role: text('role'),
  at: ts('at').defaultNow().notNull(),
}, (t) => [
  index('api_metrics_at_idx').on(t.at),
  index('api_metrics_route_idx').on(t.route, t.at),
])

// ───────────────────────── Complaint ─────────────────────────
exports.complaints = pgTable('complaints', {
  id: serial('id').primaryKey(),
  reporter_id: integer('reporter_id').notNull().references(() => exports.users.id),
  target_type: text('target_type').notNull(),
  booking_id: integer('booking_id').references(() => exports.bookings.id),
  doctor_id: integer('doctor_id').references(() => exports.doctors.id),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('OPEN').notNull(),
  admin_note: text('admin_note'),
  handled_by: integer('handled_by'),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, (t) => [
  index('complaints_status_idx').on(t.status),
  check('complaints_target_chk', sql`${t.target_type} in ('DOCTOR','BOOKING','PAYMENT','SERVICE')`),
  check('complaints_status_chk', sql`${t.status} in ('OPEN','PROCESSING','RESOLVED','REJECTED')`),
])

// ───────────────────────── System ─────────────────────────
/** Cờ trạng thái hệ thống (đã seed, đã chuyển dữ liệu sang MongoDB…) */
exports.app_meta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: jsonb('value'),
  updated_at: updatedAt(),
})
