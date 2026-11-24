import AsyncStorage from '@react-native-async-storage/async-storage'
import { getApiBaseUrl } from '../config'

const STORAGE_SESSION_KEY = 'medigo.session'

export interface SessionUser {
  id: number
  email: string
  phone?: string | null
  fullName: string
  role: 'PATIENT' | 'DOCTOR' | 'ADMIN'
  avatar?: string | null
  patientId: number | null
  doctorId: number | null
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  specialty?: string | null
}

export interface Session {
  accessToken: string
  refreshToken: string
  user: SessionUser
}

export class ApiError extends Error {
  status: number
  code: string
  details?: any
  constructor(status: number, code: string, message: string, details?: any) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export async function getStoredSession(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function saveSession(s: Session | null): Promise<void> {
  if (s) {
    await AsyncStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(s))
  } else {
    await AsyncStorage.removeItem(STORAGE_SESSION_KEY)
  }
}

let refreshingPromise: Promise<boolean> | null = null

async function tryRefreshToken(): Promise<boolean> {
  const session = await getStoredSession()
  if (!session?.refreshToken) return false

  if (!refreshingPromise) {
    refreshingPromise = (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        })
        if (!res.ok) return false
        const data = await res.json()
        const updated = {
          ...session,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        }
        await saveSession(updated)
        return true
      } catch {
        return false
      } finally {
        refreshingPromise = null
      }
    })()
  }
  return refreshingPromise
}

export async function request<T = any>(
  endpoint: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const cleanEndpoint = endpoint.replace(/^\/+/, '')
  const baseUrl = getApiBaseUrl()
  const url = `${baseUrl}/${cleanEndpoint}`

  const session = await getStoredSession()
  const headers = new Headers(options.headers || {})

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (session?.accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${session.accessToken}`)
  }

  try {
    const res = await fetch(url, { ...options, headers })

    if (res.status === 401 && retry) {
      const refreshed = await tryRefreshToken()
      if (refreshed) {
        return request<T>(endpoint, options, false)
      }
    }

    const json = await res.json().catch(() => null)

    if (!res.ok) {
      const err = json?.error || {}
      throw new ApiError(
        res.status,
        err.code || 'HTTP_ERROR',
        err.message || `Lỗi yêu cầu: ${res.status}`,
        err.details
      )
    }

    return json as T
  } catch (err: any) {
    if (err instanceof ApiError) throw err
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      `Không thể kết nối đến máy chủ (${url}). Hãy kiểm tra xem Backend đã khởi chạy chưa.`
    )
  }
}

// ======================== Các hàm API tiện ích ========================

export const api = {
  // Auth
  login: (body: { email: string; password: string }) =>
    request<{ accessToken: string; refreshToken: string; user: SessionUser }>(
      'auth/login',
      { method: 'POST', body: JSON.stringify(body) }
    ),

  register: (body: any) =>
    request<{ accessToken: string; refreshToken: string; user: SessionUser }>(
      'auth/register',
      { method: 'POST', body: JSON.stringify(body) }
    ),

  getMe: () => request<SessionUser>('auth/me'),

  // Bác sĩ & Chuyên khoa
  getSpecialties: () => request<any[]>('specialties'),

  getDoctors: async (params: {
    lat?: number
    lng?: number
    radiusKm?: number
    specialtyId?: number
    q?: string
  }) => {
    const sp = new URLSearchParams()
    if (params.lat != null) sp.set('lat', String(params.lat))
    if (params.lng != null) sp.set('lng', String(params.lng))
    if (params.radiusKm != null) {
      sp.set('radius', String(params.radiusKm))
      sp.set('radiusKm', String(params.radiusKm))
    }
    if (params.specialtyId != null) sp.set('specialtyId', String(params.specialtyId))
    if (params.q) sp.set('q', params.q)
    const res = await request<any>(`doctors?${sp.toString()}`)
    return Array.isArray(res) ? res : res?.items || res?.doctors || []
  },

  getDoctorDetail: (id: number) => request<any>(`doctors/${id}`),

  getDoctorSlots: (id: number, date?: string) => {
    const sp = date ? `?date=${date}` : ''
    return request<any[]>(`schedules/slots?doctorId=${id}${sp}`)
  },

  // Khám ngay & Đặt lịch
  previewOnDemand: (params: {
    specialtyId?: number
    lat: number
    lng: number
    radiusKm?: number
    algorithm?: string
  }) => {
    const sp = new URLSearchParams()
    if (params.specialtyId) sp.set('specialtyId', String(params.specialtyId))
    sp.set('lat', String(params.lat))
    sp.set('lng', String(params.lng))
    if (params.radiusKm) sp.set('radiusKm', String(params.radiusKm))
    if (params.algorithm) sp.set('algorithm', params.algorithm)
    return request<any>(`bookings/preview?${sp.toString()}`)
  },

  createOnDemand: (body: {
    specialtyId: number
    consultationType: 'ONLINE' | 'IN_PERSON'
    lat: number
    lng: number
    address?: string
    symptoms?: string
    radiusKm?: number
  }) =>
    request<any>('bookings/on-demand', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  createScheduled: (body: {
    doctorId: number
    slotId: number
    consultationType: 'ONLINE' | 'IN_PERSON'
    symptoms?: string
  }) =>
    request<any>('bookings', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getBookings: async (scope = 'all', page = 1) => {
    const res = await request<any>(`bookings?scope=${scope}&page=${page}`)
    return Array.isArray(res) ? res : res?.items || []
  },

  getBookingsPaged: (scope = 'all', page = 1) =>
    request<any>(`bookings?scope=${scope}&page=${page}`),

  getBookingDetail: (id: number) => request<any>(`bookings/${id}`),

  cancelBooking: (id: number, reason?: string) =>
    request<any>(`bookings/${id}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }),

  acceptBooking: (id: number) =>
    request<any>(`bookings/${id}/accept`, { method: 'POST' }),

  rejectBooking: (id: number, reason?: string) =>
    request<any>(`bookings/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Dành riêng cho Bác sĩ (Doctor Portal APIs)
  getDoctorMe: () => request<any>('doctors/me'),

  updateDoctorStatus: (body: {
    status?: 'ONLINE' | 'OFFLINE'
    availability?: 'AVAILABLE' | 'UNAVAILABLE'
  }) =>
    request<any>('doctors/me/status', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  updateDoctorLocation: (body: { lat: number; lng: number }) =>
    request<any>('doctors/me/location', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  getDoctorStats: () => request<any>('doctors/me/stats'),

  getDoctorRequests: () => request<any[]>('doctors/me/requests'),

  getDoctorSchedule: () => request<any[]>('schedules/me'),

  getDoctorMySlots: (days = 7) =>
    request<any[]>(`schedules/me/slots?days=${days}`),

  saveDoctorSchedule: (items: any[]) =>
    request<any>('schedules/me', {
      method: 'PUT',
      body: JSON.stringify({ items }),
    }),

  startConsultation: (bookingId: number) =>
    request<any>(`consultations/${bookingId}/start`, { method: 'POST' }),

  endConsultation: (
    bookingId: number,
    body: { notes?: string; advice?: string; followUp?: string }
  ) =>
    request<any>(`consultations/${bookingId}/end`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // AI gợi ý chuyên khoa
  suggestSpecialty: (body: { text: string; lat?: number; lng?: number }) =>
    request<any>('ai/suggest-specialty', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Tin nhắn trò chuyện
  getMessages: (bookingId: number) =>
    request<any[]>(`conversations/${bookingId}/messages`),

  sendMessage: (bookingId: number, content: string) =>
    request<any>(`conversations/${bookingId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  // Thanh toán giả lập & Đánh giá
  createPayment: (body: { bookingId: number; method: string }) =>
    request<any>('payments', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  submitReview: (body: {
    bookingId: number
    rating: number
    comment?: string
  }) =>
    request<any>('reviews', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ======================== Quản trị viên (Admin Portal APIs) ========================
  getAdminStats: () => request<any>('admin/stats'),

  getAdminDoctors: (params?: {
    verification?: string
    q?: string
    status?: string
    page?: number
  }) => {
    const sp = new URLSearchParams()
    if (params?.verification) sp.set('verification', params.verification)
    if (params?.q) sp.set('q', params.q)
    if (params?.status) sp.set('status', params.status)
    if (params?.page) sp.set('page', String(params.page))
    return request<any>(`admin/doctors?${sp.toString()}`)
  },

  verifyDoctor: (
    id: number,
    status: 'APPROVED' | 'REJECTED' | 'PENDING',
    note?: string
  ) =>
    request<any>(`admin/doctors/${id}/verify`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    }),

  getAdminUsers: (params?: { role?: string; q?: string; page?: number }) => {
    const sp = new URLSearchParams()
    if (params?.role) sp.set('role', params.role)
    if (params?.q) sp.set('q', params.q)
    if (params?.page) sp.set('page', String(params.page))
    return request<any>(`admin/users?${sp.toString()}`)
  },

  toggleUserActive: (id: number, isActive: boolean) =>
    request<any>(`admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    }),

  getAdminBookings: (params?: {
    status?: string
    type?: string
    q?: string
    page?: number
  }) => {
    const sp = new URLSearchParams()
    if (params?.status) sp.set('status', params.status)
    if (params?.type) sp.set('type', params.type)
    if (params?.q) sp.set('q', params.q)
    if (params?.page) sp.set('page', String(params.page))
    return request<any>(`admin/bookings?${sp.toString()}`)
  },

  getAdminSystem: () => request<any>('admin/system'),
}
