import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronRight, LocateFixed, Power, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { errorMessage, patch } from '@/lib/http'
import { BTYPE, CTYPE, pct, relative, time, vnDateKey, vnd } from '@/lib/format'
import { HeaderActions } from '@/components/layouts'
import { Btn, Card, Empty, ErrorBox, SectionTitle, Spinner, StatusBadge } from '@/components/kit'
import { cn } from '@/lib/utils'
import { LOAD_ERROR, inDanang, useDoctorMe, useDoctorRequests, useDoctorStats, type DoctorMe, type TodayItem } from './common'

function Switch({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50', checked ? 'bg-teal-700' : 'bg-slate-300')}
    >
      <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  )
}

export default function HomePage() {
  const { user } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const me = useDoctorMe()
  const stats = useDoctorStats()
  const reqs = useDoctorRequests()
  const [locating, setLocating] = useState(false)

  const statusMut = useMutation({
    mutationFn: (body: { status?: 'ONLINE' | 'OFFLINE'; availability?: 'AVAILABLE' | 'UNAVAILABLE' }) =>
      patch<{ status: DoctorMe['status']; availability: DoctorMe['availability']; warning?: string | null }>('doctors/me/status', body),
    onSuccess: (r) => {
      qc.setQueryData<DoctorMe>(['doctor-me'], (old) => (old ? { ...old, status: r.status, availability: r.availability } : old))
      if (r.warning) toast.warning(r.warning)
      else toast.success(r.status === 'OFFLINE' ? 'Đã chuyển sang offline' : r.availability === 'AVAILABLE' ? 'Bạn đang sẵn sàng nhận bệnh' : 'Đã tạm ngừng nhận bệnh mới')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const shareLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Trình duyệt không hỗ trợ định vị.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        if (!inDanang(lat, lng)) {
          setLocating(false)
          toast.warning('Vị trí GPS nằm ngoài Đà Nẵng nên chưa được cập nhật. Hệ thống giữ vị trí hiện tại.')
          return
        }
        try {
          await patch('doctors/me/location', { lat, lng })
          await qc.invalidateQueries({ queryKey: ['doctor-me'] })
          toast.success('Đã cập nhật vị trí của bạn')
        } catch (e) {
          toast.error(errorMessage(e))
        } finally {
          setLocating(false)
        }
      },
      (err) => {
        setLocating(false)
        toast.error(err.code === err.PERMISSION_DENIED ? 'Bạn chưa cho phép truy cập vị trí.' : 'Không lấy được vị trí. Thử lại.')
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const d = me.data
  const name = d?.fullName || user?.fullName || ''
  const verification = d?.verificationStatus || user?.verificationStatus
  const online = d?.status === 'ONLINE' || d?.status === 'BUSY'
  const available = d?.availability === 'AVAILABLE'
  const pending = reqs.data?.length ?? 0
  const s = stats.data

  return (
    <div>
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">Xin chào</p>
          <h1 className="truncate text-base font-semibold text-slate-900">BS. {name}</h1>
        </div>
        <HeaderActions notificationsPath="/d/notifications" />
      </div>

      <div className="space-y-3 px-4 pt-4">
        {verification && verification !== 'APPROVED' && (
          <div className={cn('flex gap-3 rounded-2xl border px-4 py-3 text-sm', verification === 'REJECTED' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900')}>
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">{verification === 'REJECTED' ? 'Hồ sơ chưa được duyệt' : 'Hồ sơ đang chờ duyệt'}</p>
              <p className="mt-0.5">Bạn chưa xuất hiện trong hệ thống matching cho đến khi quản trị viên duyệt hồ sơ.</p>
              {verification === 'REJECTED' && d?.verificationNote && <p className="mt-1">Lý do: {d.verificationNote}</p>}
              <Link to="/d/profile" className="mt-1 inline-block font-semibold underline">
                Cập nhật hồ sơ
              </Link>
            </div>
          </div>
        )}

        {me.isLoading ? (
          <Spinner />
        ) : me.isError ? (
          <ErrorBox message={LOAD_ERROR} onRetry={() => me.refetch()} />
        ) : d ? (
          <Card className="p-5">
            <div className="flex items-center gap-4">
              <button
                type="button"
                aria-label={online ? 'Chuyển sang offline' : 'Chuyển sang online'}
                disabled={statusMut.isPending}
                onClick={() => statusMut.mutate({ status: online ? 'OFFLINE' : 'ONLINE' })}
                className={cn(
                  'flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 transition disabled:opacity-60',
                  online ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-500',
                )}
              >
                <Power className="h-7 w-7" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold text-slate-900">{d.status === 'BUSY' ? 'Đang khám' : online ? 'Online' : 'Offline'}</p>
                  <StatusBadge status={d.status} />
                </div>
                <p className="text-sm text-slate-500">{online ? 'Chạm để chuyển sang offline' : 'Chạm để bắt đầu nhận yêu cầu'}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <div>
                <p className="text-sm font-medium text-slate-900">Sẵn sàng nhận bệnh</p>
                <p className="text-xs text-slate-500">{!online ? 'Cần bật online trước' : available ? 'Hệ thống có thể gửi yêu cầu khám ngay cho bạn' : 'Tạm ngừng nhận yêu cầu mới'}</p>
              </div>
              <Switch
                label="Sẵn sàng nhận bệnh"
                checked={online && available}
                disabled={!online || statusMut.isPending}
                onChange={(v) => statusMut.mutate({ availability: v ? 'AVAILABLE' : 'UNAVAILABLE' })}
              />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">Vị trí hiện tại</p>
                <p className="truncate text-xs text-slate-500">
                  {d.latitude != null && d.longitude != null ? `${d.latitude.toFixed(4)}, ${d.longitude.toFixed(4)}` : 'Chưa có vị trí'}
                  {d.locationUpdatedAt && ` · cập nhật ${relative(d.locationUpdatedAt)}`}
                </p>
              </div>
              <Btn variant="outline" className="shrink-0 px-3 py-2" loading={locating} onClick={shareLocation}>
                {!locating && <LocateFixed className="h-4 w-4" />} Chia sẻ vị trí
              </Btn>
            </div>
          </Card>
        ) : null}

        <Card onClick={() => nav('/d/requests')} className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Yêu cầu mới</p>
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{reqs.isLoading ? '…' : reqs.isError ? '—' : pending}</p>
          </div>
          <Btn variant={pending > 0 ? 'primary' : 'secondary'} className="shrink-0" onClick={(e) => (e.stopPropagation(), nav('/d/requests'))}>
            Xem yêu cầu <ChevronRight className="h-4 w-4" />
          </Btn>
        </Card>
      </div>

      <div className="px-4">
        <SectionTitle action={<Link to="/d/schedule" className="text-sm font-medium text-teal-700">Lịch làm việc</Link>}>Lịch hôm nay</SectionTitle>
        {stats.isLoading ? (
          <Spinner />
        ) : stats.isError ? (
          <ErrorBox message={LOAD_ERROR} onRetry={() => stats.refetch()} />
        ) : !s?.today.length ? (
          <Empty title="Chưa có lịch khám" hint="Các ca đã xác nhận trong hôm nay và ngày mai sẽ hiện ở đây." />
        ) : (
          <TodayList items={s.today} />
        )}

        <SectionTitle action={<Link to="/d/stats" className="text-sm font-medium text-teal-700">Xem thống kê</Link>}>Tổng quan</SectionTitle>
        {s && (
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Ca hoàn thành" value={String(s.byStatus.COMPLETED || 0)} />
            <MiniStat label="Tỷ lệ nhận" value={pct(s.acceptanceRate, 0)} />
            <MiniStat label="Đánh giá" value={s.rating ? `${s.rating.toFixed(1)} / 5` : 'Chưa có'} hint={s.totalReviews ? `${s.totalReviews} lượt` : undefined} />
            <MiniStat label="Doanh thu tháng này" value={vnd(s.revenueMonth)} />
          </div>
        )}
      </div>
    </div>
  )
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function TodayList({ items }: { items: TodayItem[] }) {
  const today = vnDateKey(new Date())
  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {items.map((b) => {
        const isToday = !b.scheduled_at || vnDateKey(b.scheduled_at) <= today
        return (
          <Link key={b.id} to={`/d/bookings/${b.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
            <div className="w-14 shrink-0 text-center">
              <p className="text-sm font-semibold tabular-nums text-slate-900">{time(b.scheduled_at)}</p>
              <p className="text-[11px] text-slate-500">{isToday ? 'Hôm nay' : 'Ngày mai'}</p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{b.patient_name}</p>
              <p className="truncate text-xs text-slate-500">
                {BTYPE[b.type] || b.type} · {CTYPE[b.consultation_type] || b.consultation_type}
                {b.symptoms && ` · ${b.symptoms}`}
              </p>
            </div>
            <StatusBadge status={b.status} />
          </Link>
        )
      })}
    </div>
  )
}
