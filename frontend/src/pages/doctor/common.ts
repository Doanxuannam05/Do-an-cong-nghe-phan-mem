import { useQuery } from '@tanstack/react-query'
import { get } from '@/lib/http'

/** Hồ sơ đầy đủ của bác sĩ đang đăng nhập (GET doctors/me) */
export interface DoctorMe {
  id: number
  userId: number
  fullName: string
  avatar?: string | null
  specialtyId?: number | null
  specialty?: { id: number; name: string; slug?: string; icon?: string } | null
  specialties: { id: number; name: string; slug?: string }[]
  clinic?: { id: number; name: string; address?: string } | null
  experienceYears?: number | null
  education?: string | null
  description?: string | null
  consultationFee?: number | null
  consultationTypes: string[]
  latitude?: number | null
  longitude?: number | null
  rating?: number | null
  totalReviews?: number | null
  status: 'ONLINE' | 'OFFLINE' | 'BUSY'
  availability: 'AVAILABLE' | 'UNAVAILABLE'
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  isAvailableNow?: boolean
  currentLoad?: number
  email?: string
  phone?: string | null
  licenseNumber?: string | null
  verificationNote?: string | null
  locationUpdatedAt?: string | null
}

export interface TodayItem {
  id: number
  code: string
  status: string
  type: string
  consultation_type: string
  scheduled_at: string | null
  symptoms?: string | null
  patient_name: string
}

export interface DoctorStats {
  byStatus: Record<string, number>
  offers: { offered?: number; accepted?: number; rejected?: number; expired?: number; avgResponseMs?: number | null }
  acceptanceRate: number | null
  revenue: number
  revenueMonth: number
  series: { day: string; completed: number }[]
  ratingDistribution: Record<string, number>
  reviews: { id: number; rating: number; comment?: string | null; created_at: string; patient_name: string }[]
  today: TodayItem[]
  rating?: number | null
  totalReviews?: number | null
}

export interface OfferItem {
  offerId: number
  bookingId: number
  code: string
  type: 'ON_DEMAND' | 'SCHEDULED'
  consultationType: string
  symptoms?: string | null
  scheduledAt?: string | null
  address?: string | null
  specialty?: string | null
  patientName: string
  distanceKm?: number | null
  score?: number | null
  expiresAt: string
  offeredAt: string
  timeoutSec: number
}

export const useDoctorMe = () => useQuery({ queryKey: ['doctor-me'], queryFn: () => get<DoctorMe>('doctors/me'), staleTime: 60_000 })
export const useDoctorStats = () => useQuery({ queryKey: ['doctor-stats'], queryFn: () => get<DoctorStats>('doctors/me/stats'), staleTime: 60_000 })
export const useDoctorRequests = () => useQuery({ queryKey: ['doctor-requests'], queryFn: () => get<OfferItem[]>('doctors/me/requests'), staleTime: 30_000 })

/** Đà Nẵng xấp xỉ – vị trí GPS ngoài vùng này sẽ không được dùng */
export const inDanang = (lat: number, lng: number) => lat >= 15.9 && lat <= 16.2 && lng >= 108.0 && lng <= 108.35

export const LOAD_ERROR = 'Không tải được dữ liệu. Thử lại.'
