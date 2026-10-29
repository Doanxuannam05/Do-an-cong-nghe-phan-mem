import { useQuery } from '@tanstack/react-query'
import { get } from './http'
import { useAuth } from './auth'
import { useLocation as useGeo } from './location'

export interface Specialty {
  id: number
  name: string
  slug: string
  icon: string
  description?: string
  related?: string[]
  status: string
  doctorCount?: number
  onlineCount?: number
}

export interface Doctor {
  id: number
  userId: number
  fullName: string
  avatar: string | null
  specialtyId: number
  specialty: { id: number; name: string; slug: string; icon: string } | null
  specialties: { id: number; name: string; slug: string }[]
  clinic: { id: number; name: string; address: string } | null
  experienceYears: number
  education: string | null
  description: string | null
  consultationFee: number
  consultationTypes: string[]
  latitude: number
  longitude: number
  rating: number
  totalReviews: number
  status: string
  availability: string
  verificationStatus: string
  isAvailableNow: boolean
  currentLoad: number
  isSimulated: boolean
  distanceKm: number | null
  matchScore?: number
  components?: Record<string, number>
}

export interface Paged<T> {
  items: T[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PatientProfile {
  id: number
  fullName: string
  email: string
  phone: string | null
  avatar: string | null
  dateOfBirth: string | null
  gender: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  completedCount: number
}

export const useSpecialties = () => useQuery({ queryKey: ['specialties'], queryFn: () => get<Specialty[]>('specialties'), staleTime: 5 * 60_000 })

export function usePatientProfile() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['patient-me'], queryFn: () => get<PatientProfile>('patients/me'), enabled: user?.role === 'PATIENT', staleTime: 5 * 60_000 })
}

/** Vị trí người bệnh: GPS → hồ sơ → trung tâm Đà Nẵng */
export function useMyLocation() {
  const profile = usePatientProfile()
  return useGeo(profile.data)
}
