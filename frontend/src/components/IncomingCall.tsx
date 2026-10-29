import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Phone, PhoneOff, Video } from 'lucide-react'
import { useRealtime } from '@/lib/realtime'
import { post } from '@/lib/http'

interface Ring {
  bookingId: number
  fromName: string
  code: string
}

/** Cửa sổ "Cuộc gọi video đến" – hiển thị ở mọi trang của Patient/Doctor */
export default function IncomingCall() {
  const [ring, setRing] = useState<Ring | null>(null)
  const nav = useNavigate()
  const loc = useLocation()
  const base = loc.pathname.startsWith('/d') ? '/d' : '/p'

  useRealtime('RTC_SIGNAL', (s) => {
    if (s.type === 'ring' && !loc.pathname.includes('/call/')) setRing({ bookingId: s.bookingId, fromName: s.fromName, code: s.code })
    if (s.type === 'end' && ring?.bookingId === s.bookingId) setRing(null)
  })

  if (!ring) return null
  return (
    <div className="fixed inset-x-0 top-3 z-50 mx-auto w-[calc(100%-24px)] max-w-sm rounded-2xl bg-slate-900 p-4 text-white shadow-2xl">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-600">
          <Video className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-300">Cuộc gọi video đến · {ring.code}</p>
          <p className="truncate font-semibold">{ring.fromName}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            post(`rtc/${ring.bookingId}/signal`, { type: 'reject' }).catch(() => {})
            setRing(null)
          }}
          className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold"
        >
          <PhoneOff className="h-4 w-4" /> Từ chối
        </button>
        <button
          onClick={() => {
            const id = ring.bookingId
            setRing(null)
            nav(`${base}/call/${id}?answer=1`)
          }}
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold"
        >
          <Phone className="h-4 w-4" /> Nghe
        </button>
      </div>
    </div>
  )
}
