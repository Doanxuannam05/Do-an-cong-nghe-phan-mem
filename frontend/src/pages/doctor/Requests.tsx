import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarClock, MapPin, Video, Building2, Zap } from 'lucide-react'
import { ApiError, errorMessage, post } from '@/lib/http'
import { CTYPE, dateTime, km, relative } from '@/lib/format'
import { HeaderActions } from '@/components/layouts'
import { Btn, Card, Chip, CountdownRing, Empty, ErrorBox, PageHeader, Spinner, useCountdown } from '@/components/kit'
import { LOAD_ERROR, useDoctorRequests, type OfferItem } from './common'

const REASONS_NOW = ['Đang bận', 'Ngoài chuyên môn', 'Khoảng cách quá xa']
const REASONS_SCHEDULED = ['Trùng lịch', 'Ngoài chuyên môn', 'Không thể khám giờ này']

export default function RequestsPage() {
  const reqs = useDoctorRequests()
  const items = reqs.data || []
  const onDemand = items.filter((x) => x.type === 'ON_DEMAND')
  const scheduled = items.filter((x) => x.type !== 'ON_DEMAND')

  return (
    <div>
      <PageHeader title="Yêu cầu khám" subtitle="Yêu cầu khám ngay cần phản hồi trong 30 giây" right={<HeaderActions notificationsPath="/d/notifications" />} />
      <div className="space-y-3 px-4 py-4">
        {reqs.isLoading ? (
          <Spinner />
        ) : reqs.isError ? (
          <ErrorBox message={LOAD_ERROR} onRetry={() => reqs.refetch()} />
        ) : !items.length ? (
          <Empty title="Chưa có yêu cầu mới" hint="Khi bạn online và sẵn sàng, yêu cầu khám ngay sẽ hiện ở đây và trên màn hình chính." />
        ) : (
          <>
            {onDemand.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">Khám ngay ({onDemand.length})</h2>
                {onDemand.map((o) => (
                  <OfferCard key={o.offerId} o={o} />
                ))}
              </section>
            )}
            {scheduled.length > 0 && (
              <section className="space-y-3 pt-2">
                <h2 className="text-sm font-semibold text-slate-900">Lịch hẹn chờ xác nhận ({scheduled.length})</h2>
                {scheduled.map((o) => (
                  <OfferCard key={o.offerId} o={o} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function OfferCard({ o }: { o: OfferItem }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const now = o.type === 'ON_DEMAND'
  const left = useCountdown(now ? o.expiresAt : null)
  const expired = now && left === 0
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)
  const [rejecting, setRejecting] = useState(false)

  const refresh = () => Promise.all(['doctor-requests', 'doctor-stats', 'bookings'].map((k) => qc.invalidateQueries({ queryKey: [k] })))

  const accept = async () => {
    setBusy('accept')
    try {
      await post(`bookings/${o.bookingId}/accept`)
      toast.success(now ? 'Đã nhận ca khám' : 'Đã xác nhận lịch hẹn')
      refresh()
      nav(`/d/bookings/${o.bookingId}`)
    } catch (e) {
      toast.error(e instanceof ApiError && e.status === 409 ? 'Yêu cầu đã hết hạn hoặc đã được xử lý.' : errorMessage(e))
      refresh()
    } finally {
      setBusy(null)
    }
  }
  const reject = async (reason: string) => {
    setBusy('reject')
    try {
      await post(`bookings/${o.bookingId}/reject`, { reason })
      toast('Đã từ chối yêu cầu')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
      setRejecting(false)
      refresh()
    }
  }

  const reasons = now ? REASONS_NOW : REASONS_SCHEDULED

  return (
    <Card className={expired ? 'opacity-60' : now ? 'border-teal-300' : ''}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={now ? 'inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 font-medium text-teal-800' : 'inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-800'}>
              {now ? <Zap className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
              {now ? 'Khám ngay' : 'Đặt lịch'}
            </span>
            <span className="text-slate-500">{o.code}</span>
            <span className="text-slate-400">· {relative(o.offeredAt)}</span>
          </div>
          <p className="mt-1.5 font-semibold text-slate-900">{o.patientName}</p>
          <p className="text-sm text-slate-600">{o.specialty || 'Chưa rõ chuyên khoa'}</p>
        </div>
        {now && <CountdownRing until={o.expiresAt} total={o.timeoutSec || 30} size={52} />}
      </div>

      {!now && o.scheduledAt && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
          <CalendarClock className="mr-1.5 inline h-4 w-4 text-slate-500" />
          {dateTime(o.scheduledAt)}
        </p>
      )}
      {o.symptoms && <p className="mt-2 text-sm text-slate-700">Triệu chứng: {o.symptoms}</p>}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
        <span className="inline-flex items-center gap-1">
          {o.consultationType === 'ONLINE' ? <Video className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
          {CTYPE[o.consultationType] || o.consultationType}
        </span>
        {o.distanceKm != null && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {km(o.distanceKm)}
          </span>
        )}
      </div>
      {o.address && <p className="mt-1 text-sm text-slate-600">Địa chỉ: {o.address}</p>}

      {expired ? (
        <p className="mt-3 text-sm text-amber-700">Hết thời gian phản hồi – yêu cầu đã được chuyển cho bác sĩ khác.</p>
      ) : rejecting ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium text-slate-700">Chọn lý do từ chối</p>
          <div className="flex flex-wrap gap-2">
            {reasons.map((r) => (
              <Chip key={r} onClick={() => !busy && reject(r)}>
                {r}
              </Chip>
            ))}
          </div>
          <Btn variant="ghost" className="w-full" disabled={!!busy} onClick={() => setRejecting(false)}>
            Quay lại
          </Btn>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Btn variant="outline" className="py-3" disabled={!!busy} loading={busy === 'reject'} onClick={() => setRejecting(true)}>
            Từ chối
          </Btn>
          <Btn className="py-3" disabled={!!busy} loading={busy === 'accept'} onClick={accept}>
            {now ? 'Nhận ca' : 'Xác nhận'}
          </Btn>
        </div>
      )}
    </Card>
  )
}
