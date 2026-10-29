import { useCallback, useEffect, useState } from 'react'

export interface LatLng {
  lat: number
  lng: number
}
export const DANANG: LatLng = { lat: 16.0611, lng: 108.2238 }
const KEY = 'medigo.location'

/** Đà Nẵng xấp xỉ: nếu GPS trả về vị trí ngoài thành phố (demo từ nơi khác) thì dùng vị trí demo */
const inDanang = (p: LatLng) => p.lat > 15.9 && p.lat < 16.2 && p.lng > 108.0 && p.lng < 108.35

export interface LocationState {
  location: LatLng
  source: 'gps' | 'profile' | 'manual' | 'default'
  label: string
  locating: boolean
  error: string | null
}

function load(): LocationState | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}

/** Vị trí hiện tại của người dùng (GPS → hồ sơ → mặc định Đà Nẵng), được lưu lại giữa các trang */
export function useLocation(profile?: { latitude?: number | null; longitude?: number | null; address?: string | null } | null) {
  const [state, setState] = useState<LocationState>(() => load() || { location: DANANG, source: 'default', label: 'Trung tâm Đà Nẵng', locating: false, error: null })

  useEffect(() => {
    if (state.source === 'default' && profile?.latitude != null && profile.longitude != null) {
      setState({ location: { lat: profile.latitude, lng: profile.longitude }, source: 'profile', label: profile.address || 'Vị trí trong hồ sơ', locating: false, error: null })
    }
  }, [profile?.latitude, profile?.longitude, profile?.address, state.source])

  useEffect(() => {
    if (!state.locating) localStorage.setItem(KEY, JSON.stringify(state))
    const on = () => {
      const s = load()
      if (s && (s.location.lat !== state.location.lat || s.location.lng !== state.location.lng)) setState(s)
    }
    window.addEventListener('medigo:location', on)
    return () => window.removeEventListener('medigo:location', on)
  }, [state])

  const set = useCallback((location: LatLng, source: LocationState['source'], label: string) => {
    const s = { location, source, label, locating: false, error: null }
    localStorage.setItem(KEY, JSON.stringify(s))
    setState(s)
    window.dispatchEvent(new Event('medigo:location'))
  }, [])

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: 'Trình duyệt không hỗ trợ GPS' }))
      return
    }
    setState((s) => ({ ...s, locating: true, error: null }))
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        if (inDanang(p)) set(p, 'gps', `Vị trí GPS (±${Math.round(pos.coords.accuracy)} m)`)
        else {
          set(DANANG, 'default', 'Trung tâm Đà Nẵng')
          setState((s) => ({ ...s, error: 'Bạn đang ở ngoài Đà Nẵng – dùng vị trí demo tại trung tâm thành phố' }))
        }
      },
      () => setState((s) => ({ ...s, locating: false, error: 'Không lấy được vị trí GPS – kiểm tra quyền truy cập vị trí' })),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [set])

  return { ...state, locate, set }
}
