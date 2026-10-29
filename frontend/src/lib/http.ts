import { api } from './api'

/** Lỗi API chuẩn hóa: { error: { code, message, details } } */
export class ApiError extends Error {
  status: number
  code: string
  details?: { path: string; message: string }[]
  constructor(status: number, code: string, message: string, details?: { path: string; message: string }[]) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

const KEY = 'medigo.session'

export interface Session {
  accessToken: string
  refreshToken: string
  user: SessionUser
}
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
}

export function loadSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}
export function saveSession(s: Session | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s))
  else localStorage.removeItem(KEY)
  window.dispatchEvent(new Event('medigo:session'))
}

let refreshing: Promise<boolean> | null = null
async function refresh(): Promise<boolean> {
  const s = loadSession()
  if (!s?.refreshToken) return false
  if (!refreshing) {
    refreshing = fetch(api('auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: s.refreshToken }),
    })
      .then(async (r) => {
        if (!r.ok) return false
        const j = await r.json()
        const cur = loadSession()
        if (cur) saveSession({ ...cur, accessToken: j.accessToken, refreshToken: j.refreshToken })
        return true
      })
      .catch(() => false)
      .finally(() => setTimeout(() => (refreshing = null), 0))
  }
  return refreshing
}

/** fetch có token + tự refresh khi 401 */
export async function http<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const s = loadSession()
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
  if (init.json !== undefined) headers['Content-Type'] = 'application/json'
  if (s?.accessToken) headers.Authorization = `Bearer ${s.accessToken}`
  const res = await fetch(api(path), { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body })
  if (res.status === 401 && retry && s?.refreshToken && !path.startsWith('auth/')) {
    if (await refresh()) return http<T>(path, init, false)
    saveSession(null)
  }
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const e = data?.error || {}
    throw new ApiError(res.status, e.code || 'ERROR', e.message || 'Không thể kết nối máy chủ. Vui lòng thử lại.', e.details)
  }
  return data as T
}

export const get = <T,>(path: string) => http<T>(path)
export const post = <T,>(path: string, json?: unknown) => http<T>(path, { method: 'POST', json: json ?? {} })
export const patch = <T,>(path: string, json?: unknown) => http<T>(path, { method: 'PATCH', json: json ?? {} })
export const put = <T,>(path: string, json?: unknown) => http<T>(path, { method: 'PUT', json: json ?? {} })
export const del = <T,>(path: string) => http<T>(path, { method: 'DELETE' })

export function errorMessage(e: unknown) {
  if (e instanceof ApiError) {
    if (e.details?.length) return `${e.message}: ${e.details.map((d) => d.message).join(', ')}`
    return e.message
  }
  return 'Không thể kết nối máy chủ. Vui lòng thử lại.'
}

/** Giải mã exp của JWT (không xác minh chữ ký – chỉ để biết khi nào cần refresh) */
export function tokenExp(token?: string | null): number {
  try {
    return JSON.parse(atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000
  } catch {
    return 0
  }
}

/** Đảm bảo access token còn hạn ≥ 60s (dùng trước khi mở luồng SSE) */
export async function ensureFreshToken(): Promise<string | null> {
  const s = loadSession()
  if (!s) return null
  if (tokenExp(s.accessToken) - Date.now() > 60_000) return s.accessToken
  const ok = await refresh()
  if (!ok) {
    saveSession(null)
    return null
  }
  return loadSession()?.accessToken ?? null
}
