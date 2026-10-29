/**
 * Video Consultation (WebRTC, peer-to-peer). Signaling qua REST (gửi) + SSE (nhận):
 *   Người gọi: ring ──► (bên kia) accept ──► offer ──► answer ◄── ; ICE trao đổi hai chiều
 *   Chỉ được gọi khi booking ở trạng thái CONFIRMED / IN_PROGRESS (server kiểm tra).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Camera, CameraOff, Mic, MicOff, PhoneOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import { errorMessage, get, post } from '@/lib/http'
import { useRealtime } from '@/lib/realtime'
import type { BookingDetailData } from './BookingDetail'
import { Btn } from '@/components/kit'
import { cn } from '@/lib/utils'

const ICE: RTCConfiguration = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] }
type Phase = 'init' | 'calling' | 'connecting' | 'connected' | 'ended' | 'rejected' | 'error'

export default function VideoCall() {
  const { bookingId } = useParams()
  const id = Number(bookingId)
  const [params] = useSearchParams()
  const answerMode = params.get('answer') === '1'
  const { user } = useAuth()
  const nav = useNavigate()
  const base = user?.role === 'DOCTOR' ? '/d' : '/p'
  const booking = useQuery({ queryKey: ['booking', id], queryFn: () => get<BookingDetailData>(`bookings/${id}`), staleTime: 30_000 })

  const localRef = useRef<HTMLVideoElement>(null)
  const remoteRef = useRef<HTMLVideoElement>(null)
  const pc = useRef<RTCPeerConnection | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const pendingIce = useRef<RTCIceCandidateInit[]>([])
  const [phase, setPhase] = useState<Phase>('init')
  const [error, setError] = useState<string | null>(null)
  const [mic, setMic] = useState(true)
  const [cam, setCam] = useState(true)
  const [peerMedia, setPeerMedia] = useState<{ mic: boolean; cam: boolean }>({ mic: true, cam: true })
  const [seconds, setSeconds] = useState(0)

  const signal = useCallback((type: string, data?: unknown) => post<{ ok: boolean }>(`rtc/${id}/signal`, { type, data }), [id])

  const cleanup = useCallback(() => {
    pc.current?.close()
    pc.current = null
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }, [])

  const ensurePc = useCallback(() => {
    if (pc.current) return pc.current
    const p = new RTCPeerConnection(ICE)
    stream.current?.getTracks().forEach((t) => p.addTrack(t, stream.current!))
    p.onicecandidate = (e) => e.candidate && signal('ice', e.candidate.toJSON()).catch(() => {})
    p.ontrack = (e) => {
      if (remoteRef.current && e.streams[0]) remoteRef.current.srcObject = e.streams[0]
    }
    p.onconnectionstatechange = () => {
      if (p.connectionState === 'connected') setPhase('connected')
      if (['failed', 'disconnected'].includes(p.connectionState)) {
        setError('Mất kết nối video. Hai thiết bị có thể đang ở mạng chặn kết nối ngang hàng (cần TURN server).')
        setPhase('error')
      }
    }
    pc.current = p
    return p
  }, [signal])

  // 1) Lấy camera/micro rồi gọi hoặc trả lời
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true })
        if (cancelled) return
        if (localRef.current) localRef.current.srcObject = stream.current
        if (answerMode) {
          setPhase('connecting')
          await signal('accept')
        } else {
          setPhase('calling')
          await signal('ring')
        }
      } catch (e) {
        const msg = e instanceof DOMException ? 'Không truy cập được camera/micro. Hãy cấp quyền cho trình duyệt (mở ứng dụng trong tab riêng nếu đang xem trong khung preview).' : errorMessage(e)
        setError(msg)
        setPhase('error')
      }
    })()
    return () => {
      cancelled = true
      signal('end').catch(() => {})
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2) Xử lý tín hiệu từ bên kia
  useRealtime('RTC_SIGNAL', async (s) => {
    if (s.bookingId !== id) return
    try {
      if (s.type === 'accept' && !answerMode) {
        setPhase('connecting')
        const p = ensurePc()
        const offer = await p.createOffer()
        await p.setLocalDescription(offer)
        await signal('offer', offer)
      } else if (s.type === 'offer') {
        const p = ensurePc()
        await p.setRemoteDescription(s.data)
        for (const c of pendingIce.current.splice(0)) await p.addIceCandidate(c)
        const ans = await p.createAnswer()
        await p.setLocalDescription(ans)
        await signal('answer', ans)
      } else if (s.type === 'answer') {
        await pc.current?.setRemoteDescription(s.data)
        for (const c of pendingIce.current.splice(0)) await pc.current?.addIceCandidate(c)
      } else if (s.type === 'ice') {
        if (pc.current?.remoteDescription) await pc.current.addIceCandidate(s.data)
        else pendingIce.current.push(s.data)
      } else if (s.type === 'reject') {
        setPhase('rejected')
        cleanup()
      } else if (s.type === 'end') {
        setPhase('ended')
        cleanup()
      } else if (s.type === 'media') {
        setPeerMedia(s.data)
      } else if (s.type === 'ring' && answerMode) {
        // bên kia gọi lại
        await signal('accept')
      }
    } catch (e) {
      console.warn('rtc', e)
    }
  })

  useEffect(() => {
    if (phase !== 'connected') return
    const t = setInterval(() => setSeconds((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [phase])

  const toggle = (kind: 'audio' | 'video') => {
    const tracks = kind === 'audio' ? stream.current?.getAudioTracks() : stream.current?.getVideoTracks()
    const next = kind === 'audio' ? !mic : !cam
    tracks?.forEach((t) => (t.enabled = next))
    if (kind === 'audio') setMic(next)
    else setCam(next)
    signal('media', { mic: kind === 'audio' ? next : mic, cam: kind === 'video' ? next : cam }).catch(() => {})
  }
  const hangup = () => {
    signal('end').catch(() => {})
    cleanup()
    setPhase('ended')
  }
  const redial = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      if (localRef.current) localRef.current.srcObject = stream.current
      setError(null)
      setPhase('calling')
      await signal('ring')
    } catch (e) {
      toast.error(errorMessage(e))
      setPhase('error')
    }
  }

  const peerName = user?.role === 'DOCTOR' ? booking.data?.patient.fullName : booking.data?.doctor ? `BS. ${booking.data.doctor.fullName}` : ''
  const mm = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <div className="relative flex h-screen flex-col bg-slate-950 text-white">
      <video ref={remoteRef} autoPlay playsInline className={cn('absolute inset-0 h-full w-full object-cover', phase !== 'connected' && 'opacity-0')} />
      <div className="relative z-10 flex items-center justify-between p-4">
        <div>
          <p className="font-semibold">{peerName}</p>
          <p className="text-sm text-slate-300">
            {{ init: 'Đang mở camera…', calling: 'Đang gọi…', connecting: 'Đang kết nối…', connected: mm, ended: 'Cuộc gọi đã kết thúc', rejected: 'Bên kia đã từ chối cuộc gọi', error: 'Không thể gọi' }[phase]}
            {phase === 'connected' && !peerMedia.mic && ' · đối phương tắt micro'}
          </p>
        </div>
        <span className="rounded-full bg-white/10 px-2 py-1 text-xs">{booking.data?.code}</span>
      </div>

      {phase !== 'connected' && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          {['init', 'calling', 'connecting'].includes(phase) && <Loader2 className="h-8 w-8 animate-spin text-teal-400" />}
          {error && <p className="max-w-xs text-sm text-rose-200">{error}</p>}
          {phase === 'calling' && <p className="max-w-xs text-sm text-slate-400">Bên kia cần đang mở ứng dụng để nhận cuộc gọi.</p>}
          {['ended', 'rejected', 'error'].includes(phase) && (
            <div className="flex gap-2">
              <Btn variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => nav(`${base}/bookings/${id}`)}>Về lịch khám</Btn>
              <Btn onClick={redial}>Gọi lại</Btn>
            </div>
          )}
        </div>
      )}
      {phase === 'connected' && !peerMedia.cam && <div className="relative z-10 flex flex-1 items-center justify-center text-slate-400">Đối phương đã tắt camera</div>}
      {phase === 'connected' && peerMedia.cam && <div className="flex-1" />}

      <video ref={localRef} autoPlay playsInline muted className={cn('absolute bottom-28 right-4 z-20 h-40 w-28 rounded-2xl bg-slate-800 object-cover ring-2 ring-white/20', !cam && 'opacity-30')} />

      <div className="relative z-20 flex items-center justify-center gap-5 pb-10 pt-4">
        <button aria-label={mic ? 'Tắt micro' : 'Bật micro'} onClick={() => toggle('audio')} className={cn('rounded-full p-4', mic ? 'bg-white/15' : 'bg-white text-slate-900')}>
          {mic ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
        <button aria-label="Kết thúc" onClick={hangup} className="rounded-full bg-rose-600 p-5">
          <PhoneOff className="h-6 w-6" />
        </button>
        <button aria-label={cam ? 'Tắt camera' : 'Bật camera'} onClick={() => toggle('video')} className={cn('rounded-full p-4', cam ? 'bg-white/15' : 'bg-white text-slate-900')}>
          {cam ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
        </button>
      </div>
    </div>
  )
}
