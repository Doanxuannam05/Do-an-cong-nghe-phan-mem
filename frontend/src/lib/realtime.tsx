/**
 * Real-time client: một luồng SSE / người dùng. Phân phối sự kiện tới các component đăng ký
 * và tự invalidate cache React Query liên quan → giao diện cập nhật ngay không cần polling.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from './api'
import { ensureFreshToken, post } from './http'
import { useAuth } from './auth'

type Handler = (data: any) => void // eslint-disable-line @typescript-eslint/no-explicit-any
interface RtCtx {
  connected: boolean
  subscribe: (event: string, h: Handler) => () => void
}
const Ctx = createContext<RtCtx>({ connected: false, subscribe: () => () => {} })

const EVENTS = [
  'CONNECTED', 'NEW_BOOKING_REQUEST', 'BOOKING_ACCEPTED', 'BOOKING_REJECTED', 'BOOKING_STATUS_CHANGED', 'OFFER_CANCELLED',
  'DOCTOR_LOCATION_UPDATED', 'DOCTOR_ONLINE', 'DOCTOR_OFFLINE', 'DOCTOR_PRESENCE', 'NEW_MESSAGE', 'TYPING', 'MESSAGE_READ',
  'PAYMENT_COMPLETED', 'NOTIFICATION', 'RTC_SIGNAL', 'CONSULTATION_COMPLETED',
]

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const qc = useQueryClient()
  const handlers = useRef(new Map<string, Set<Handler>>())
  const [connected, setConnected] = useState(false)
  const userId = session?.user.id

  useEffect(() => {
    if (!userId) return
    let es: EventSource | null = null
    let stopped = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let samples = 0
    let doctorsTimer: ReturnType<typeof setTimeout> | null = null

    const dispatchEvt = (type: string, data: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      // Đo độ trễ real-time (mẫu 1/5 sự kiện)
      if (data?._ts && type !== 'CONNECTED' && samples++ % 5 === 0) post('stream/latency', { ms: Math.max(0, Date.now() - data._ts) }).catch(() => {})
      switch (type) {
        case 'BOOKING_STATUS_CHANGED':
        case 'BOOKING_ACCEPTED':
        case 'BOOKING_REJECTED':
        case 'PAYMENT_COMPLETED':
        case 'CONSULTATION_COMPLETED':
          qc.invalidateQueries({ queryKey: ['booking', data.bookingId] })
          qc.invalidateQueries({ queryKey: ['bookings'] })
          qc.invalidateQueries({ queryKey: ['doctor-stats'] })
          qc.invalidateQueries({ queryKey: ['conversations'] })
          break
        case 'NEW_BOOKING_REQUEST':
        case 'OFFER_CANCELLED':
          qc.invalidateQueries({ queryKey: ['doctor-requests'] })
          break
        case 'NOTIFICATION':
          qc.invalidateQueries({ queryKey: ['notifications'] })
          if (!['NEW_BOOKING_REQUEST', 'NEW_MESSAGE'].includes(data.type)) toast(data.title, { description: data.body || undefined })
          break
        case 'NEW_MESSAGE':
          qc.invalidateQueries({ queryKey: ['conversations'] })
          break
        case 'DOCTOR_ONLINE':
        case 'DOCTOR_OFFLINE':
        case 'DOCTOR_LOCATION_UPDATED':
          if (!doctorsTimer) doctorsTimer = setTimeout(() => {
            doctorsTimer = null
            qc.invalidateQueries({ queryKey: ['doctors'] })
          }, 3000)
          break
      }
      handlers.current.get(type)?.forEach((h) => h(data))
      handlers.current.get('*')?.forEach((h) => h({ type, ...data }))
    }

    const connect = async () => {
      const token = await ensureFreshToken()
      if (!token || stopped) return
      es = new EventSource(api(`stream?token=${encodeURIComponent(token)}`))
      es.onopen = () => setConnected(true)
      for (const ev of EVENTS) {
        es.addEventListener(ev, (e) => {
          try {
            dispatchEvt(ev, JSON.parse((e as MessageEvent).data))
          } catch {
            /* bỏ qua sự kiện lỗi */
          }
        })
      }
      es.onerror = () => {
        setConnected(false)
        es?.close()
        if (!stopped) retryTimer = setTimeout(connect, 3000)
      }
    }
    connect()
    return () => {
      stopped = true
      es?.close()
      if (retryTimer) clearTimeout(retryTimer)
      if (doctorsTimer) clearTimeout(doctorsTimer)
      setConnected(false)
    }
  }, [userId, qc])

  const subscribe = (event: string, h: Handler) => {
    if (!handlers.current.has(event)) handlers.current.set(event, new Set())
    handlers.current.get(event)!.add(h)
    return () => handlers.current.get(event)?.delete(h)
  }

  return <Ctx.Provider value={{ connected, subscribe }}>{children}</Ctx.Provider>
}

export const useRealtimeStatus = () => useContext(Ctx).connected

/** Đăng ký nhận một loại sự kiện real-time */
export function useRealtime(event: string, handler: Handler) {
  const { subscribe } = useContext(Ctx)
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => subscribe(event, (d) => ref.current(d)), [event, subscribe])
}
