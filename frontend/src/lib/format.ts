export const TZ = 'Asia/Ho_Chi_Minh'

export const vnd = (n?: number | null) => (n == null ? '—' : `${Math.round(n).toLocaleString('vi-VN')}đ`)
export const km = (n?: number | null) => (n == null ? '—' : n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`)
export const pct = (n?: number | null, d = 1) => (n == null ? '—' : `${(n * 100).toFixed(d)}%`)

export function dateTime(s?: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}
export function time(s?: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleTimeString('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
}
export function day(s?: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('vi-VN', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' })
}
/** YYYY-MM-DD theo giờ Việt Nam */
export function vnDateKey(d: Date | string) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: TZ })
}
export function relative(s?: string | null) {
  if (!s) return ''
  const diff = (Date.now() - new Date(s).getTime()) / 1000
  if (diff < 60) return 'vừa xong'
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ngày trước`
  return day(s)
}

export const DOW = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

export type BookingStatus = 'PENDING' | 'SEARCHING' | 'OFFERED' | 'ACCEPTED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'REJECTED' | 'EXPIRED' | 'NO_DOCTOR_FOUND'

export const STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'progress' | 'good' | 'warn' | 'bad' }> = {
  PENDING: { label: 'Chờ xử lý', tone: 'neutral' },
  SEARCHING: { label: 'Đang tìm bác sĩ', tone: 'info' },
  OFFERED: { label: 'Chờ bác sĩ phản hồi', tone: 'info' },
  ACCEPTED: { label: 'Bác sĩ đã nhận', tone: 'good' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'good' },
  IN_PROGRESS: { label: 'Đang khám', tone: 'progress' },
  COMPLETED: { label: 'Hoàn thành', tone: 'good' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
  REJECTED: { label: 'Bị từ chối', tone: 'bad' },
  EXPIRED: { label: 'Hết hạn', tone: 'warn' },
  NO_DOCTOR_FOUND: { label: 'Không tìm được bác sĩ', tone: 'bad' },
  // payment / complaint / offer
  SUCCESS: { label: 'Thành công', tone: 'good' },
  FAILED: { label: 'Thất bại', tone: 'bad' },
  REFUNDED: { label: 'Đã hoàn tiền', tone: 'neutral' },
  OPEN: { label: 'Mới', tone: 'warn' },
  PROCESSING: { label: 'Đang xử lý', tone: 'info' },
  RESOLVED: { label: 'Đã giải quyết', tone: 'good' },
  APPROVED: { label: 'Đã duyệt', tone: 'good' },
  ONLINE: { label: 'Online', tone: 'good' },
  OFFLINE: { label: 'Offline', tone: 'neutral' },
  BUSY: { label: 'Đang khám', tone: 'progress' },
  VISIBLE: { label: 'Hiển thị', tone: 'good' },
  HIDDEN: { label: 'Đã ẩn', tone: 'neutral' },
  AVAILABLE: { label: 'Trống', tone: 'good' },
  BOOKED: { label: 'Đã đặt', tone: 'info' },
  BLOCKED: { label: 'Đã khóa', tone: 'neutral' },
}

export const CTYPE: Record<string, string> = { ONLINE: 'Khám online', IN_PERSON: 'Khám trực tiếp' }
export const BTYPE: Record<string, string> = { SCHEDULED: 'Đặt lịch', ON_DEMAND: 'Khám ngay' }
export const PAY_METHOD: Record<string, string> = { CASH: 'Tiền mặt', BANK_TRANSFER: 'Chuyển khoản', MOCK_PAYMENT: 'Ví giả lập' }
export const ALGO: Record<string, string> = { random: 'Random Selection', nearest: 'Nearest Doctor', multi: 'Multi-Criteria' }
