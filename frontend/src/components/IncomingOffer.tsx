import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { MapPin, Video, Building2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { useRealtime } from '@/lib/realtime'
import { errorMessage, post } from '@/lib/http'
import { CTYPE, dateTime, km } from '@/lib/format'
import { Btn, CountdownRing } from './kit'

export interface OfferPayload {
  offerId: number
  bookingId: number
  code: string
  type: 'ON_DEMAND' | 'SCHEDULED'
  consultationType: string
  specialty?: string
  patientName: string
  symptoms?: string | null
  address?: string | null
  distanceKm?: number | null
  score?: number | null
  scheduledAt?: string | null
  expiresAt: string
  timeoutSec?: number
}

/**
 * Popup yêu cầu khám ngay cho bác sĩ (giống tài xế Grab nhận cuốc):
 * đếm ngược 30 giây – hết giờ hệ thống tự chuyển cho bác sĩ kế tiếp.
 */
export default function IncomingOffer() {
  const [offer, setOffer] = useState<OfferPayload | null>(null)
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)
  const nav = useNavigate()
  const qc = useQueryClient()

  useRealtime('NEW_BOOKING_REQUEST', (o: OfferPayload) => {
    if (o.type === 'ON_DEMAND') setOffer(o)
    else toast('Lịch hẹn mới cần xác nhận', { description: `${o.patientName} · ${dateTime(o.scheduledAt)}`, action: { label: 'Xem', onClick: () => nav('/d/requests') } })
  })
  useRealtime('OFFER_CANCELLED', (e) => {
    if (offer && e.bookingId === offer.bookingId) {
      setOffer(null)
      if (e.reason === 'EXPIRED') toast.warning('Hết 30 giây – yêu cầu đã được chuyển cho bác sĩ khác')
      else if (e.reason === 'CANCELLED') toast('Người bệnh đã hủy yêu cầu')
    }
  })

  if (!offer) return null
  const respond = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'reject')
    try {
      if (accept) {
        await post(`bookings/${offer.bookingId}/accept`)
        toast.success('Đã nhận ca khám')
        nav(`/d/bookings/${offer.bookingId}`)
      } else {
        await post(`bookings/${offer.bookingId}/reject`, { reason: 'Bác sĩ đang bận' })
      }
      qc.invalidateQueries({ queryKey: ['doctor-requests'] })
      qc.invalidateQueries({ queryKey: ['doctor-stats'] })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
      setOffer(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
              <Zap className="h-3 w-3" /> Yêu cầu khám ngay
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">{offer.specialty}</h2>
            <p className="text-sm text-slate-600">
              {offer.patientName} · {offer.code}
            </p>
          </div>
          <CountdownRing until={offer.expiresAt} total={offer.timeoutSec || 30} size={60} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Khoảng cách</p>
            <p className="mt-0.5 flex items-center gap-1 font-semibold text-slate-900">
              <MapPin className="h-4 w-4 text-teal-700" /> {km(offer.distanceKm)}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Hình thức</p>
            <p className="mt-0.5 flex items-center gap-1 font-semibold text-slate-900">
              {offer.consultationType === 'ONLINE' ? <Video className="h-4 w-4 text-teal-700" /> : <Building2 className="h-4 w-4 text-teal-700" />}
              {CTYPE[offer.consultationType]}
            </p>
          </div>
        </div>
        {offer.symptoms && (
          <p className="mt-3 rounded-xl border border-slate-100 p-3 text-sm text-slate-700">
            <span className="text-xs font-medium text-slate-500">Mô tả của người bệnh: </span>
            {offer.symptoms}
          </p>
        )}
        {offer.address && <p className="mt-2 text-sm text-slate-600">Địa chỉ: {offer.address}</p>}
        {offer.score != null && <p className="mt-2 text-xs text-slate-500">Bạn được hệ thống chọn với Matching Score {offer.score} điểm.</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Btn variant="outline" loading={busy === 'reject'} disabled={!!busy} onClick={() => respond(false)}>
            Từ chối
          </Btn>
          <Btn loading={busy === 'accept'} disabled={!!busy} onClick={() => respond(true)}>
            Nhận ca
          </Btn>
        </div>
      </div>
    </div>
  )
}
