import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Building2, CalendarDays, GraduationCap, MapPin, Video, Zap, BadgeCheck } from 'lucide-react'
import { errorMessage, get, post } from '@/lib/http'
import { useMyLocation, type Doctor } from '@/lib/hooks'
import { CTYPE, DOW, day, km, relative, time, vnDateKey, vnd } from '@/lib/format'
import MapView from '@/components/MapView'
import { Avatar, Btn, Card, Chip, Empty, ErrorBox, Field, inputCls, PageHeader, RatingInline, SectionTitle, Spinner, Stars, StatusBadge } from '@/components/kit'
import { cn } from '@/lib/utils'

interface Detail extends Doctor {
  reviews: { id: number; rating: number; comment: string | null; created_at: string; patient_name: string }[]
  ratingDistribution: Record<string, number>
  slots: { id: number; start_at: string; end_at: string }[]
  schedules: { day_of_week: number; start_time: string; end_time: string }[]
  completedConsultations: number
}

export default function DoctorDetail() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const loc = useMyLocation()
  const bookRef = useRef<HTMLDivElement>(null)
  const { lat, lng } = loc.location
  const q = useQuery({ queryKey: ['doctor', id, lat.toFixed(3), lng.toFixed(3)], queryFn: () => get<Detail>(`doctors/${id}?lat=${lat}&lng=${lng}`), staleTime: 30_000 })
  const d = q.data

  const days = useMemo(() => {
    const m = new Map<string, Detail['slots']>()
    for (const s of d?.slots || []) {
      const k = vnDateKey(s.start_at)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    return [...m.entries()]
  }, [d?.slots])
  const [dayKey, setDayKey] = useState<string | null>(null)
  const [slotId, setSlotId] = useState<number | null>(null)
  const [ctype, setCtype] = useState<string>('ONLINE')
  const [symptoms, setSymptoms] = useState('')
  useEffect(() => {
    if (!dayKey && days.length) setDayKey(days[0][0])
  }, [days, dayKey])
  useEffect(() => {
    if (d && !d.consultationTypes.includes(ctype)) setCtype(d.consultationTypes[0])
  }, [d, ctype])
  useEffect(() => {
    if (params.get('book') && d) setTimeout(() => bookRef.current?.scrollIntoView({ behavior: 'smooth' }), 150)
  }, [params, d])

  const book = useMutation({
    mutationFn: () => post<{ id: number }>('bookings', { doctorId: Number(id), slotId, consultationType: ctype, symptoms: symptoms || undefined }),
    onSuccess: (b) => {
      toast.success('Đã gửi lịch hẹn – chờ bác sĩ xác nhận')
      qc.invalidateQueries({ queryKey: ['bookings'] })
      nav(`/p/bookings/${b.id}`)
    },
    onError: (e) => {
      toast.error(errorMessage(e))
      qc.invalidateQueries({ queryKey: ['doctor', id] })
      setSlotId(null)
    },
  })

  if (q.isLoading) return <><PageHeader title="Thông tin bác sĩ" back /><Spinner /></>
  if (q.isError || !d) return <><PageHeader title="Thông tin bác sĩ" back /><div className="p-4"><ErrorBox message={errorMessage(q.error)} onRetry={() => q.refetch()} /></div></>

  const totalR = Object.values(d.ratingDistribution).reduce((a, b) => a + b, 0)
  const slotsOfDay = days.find(([k]) => k === dayKey)?.[1] || []

  return (
    <div>
      <PageHeader title={`BS. ${d.fullName}`} subtitle={d.specialty?.name} back />
      <div className="space-y-3 p-4">
        <Card>
          <div className="flex gap-4">
            <Avatar src={d.avatar} doctor size={72} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-lg font-semibold text-slate-900">
                BS. {d.fullName} {d.verificationStatus === 'APPROVED' && <BadgeCheck className="h-4 w-4 text-teal-700" aria-label="Đã xác minh" />}
              </p>
              <p className="text-sm text-slate-600">{d.specialties.map((s) => s.name).join(' · ')}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <RatingInline rating={d.rating} total={d.totalReviews} />
                <StatusBadge status={d.isAvailableNow ? 'ONLINE' : d.status} label={d.isAvailableNow ? 'Đang sẵn sàng' : d.status === 'BUSY' ? 'Đang khám' : 'Chưa sẵn sàng'} />
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 rounded-xl bg-slate-50 py-3 text-center">
            <div>
              <p className="text-base font-semibold text-slate-900">{d.experienceYears} năm</p>
              <p className="text-xs text-slate-500">Kinh nghiệm</p>
            </div>
            <div>
              <p className="text-base font-semibold text-slate-900">{d.completedConsultations}</p>
              <p className="text-xs text-slate-500">Ca đã khám</p>
            </div>
            <div>
              <p className="text-base font-semibold text-slate-900">{km(d.distanceKm)}</p>
              <p className="text-xs text-slate-500">Khoảng cách</p>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-sm text-slate-700">
            {d.education && (
              <p className="flex gap-2"><GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{d.education}</p>
            )}
            {d.clinic && (
              <p className="flex gap-2"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{d.clinic.name} – {d.clinic.address}</p>
            )}
            <p className="flex gap-2">
              <Video className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              {d.consultationTypes.map((t) => CTYPE[t]).join(' · ')}
            </p>
            {d.description && <p className="text-slate-600">{d.description}</p>}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-500">Phí khám</span>
            <span className="text-lg font-semibold text-slate-900">{vnd(d.consultationFee)}</span>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Btn variant="outline" onClick={() => bookRef.current?.scrollIntoView({ behavior: 'smooth' })}>
            <CalendarDays className="h-4 w-4" /> Đặt lịch
          </Btn>
          <Btn onClick={() => nav(`/p/request?specialtyId=${d.specialtyId}`)}>
            <Zap className="h-4 w-4" /> Yêu cầu khám ngay
          </Btn>
        </div>
        <p className="text-xs text-slate-500">"Yêu cầu khám ngay" để hệ thống tự điều phối bác sĩ {d.specialty?.name} phù hợp nhất đang sẵn sàng gần bạn (có thể là bác sĩ này).</p>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <MapView center={loc.location} markers={[{ id: d.id, lat: d.latitude, lng: d.longitude, kind: 'doctor', label: d.clinic?.name || d.fullName }]} fitMarkers className="h-44 w-full" />
          <p className="flex items-center gap-1 bg-white px-3 py-2 text-xs text-slate-600">
            <MapPin className="h-3.5 w-3.5" /> Cách vị trí của bạn {km(d.distanceKm)} (đường chim bay)
          </p>
        </div>

        <div ref={bookRef} className="scroll-mt-16">
          <SectionTitle>Đặt lịch khám</SectionTitle>
          <Card>
            {!days.length ? (
              <Empty title="Chưa có khung giờ trống trong 7 ngày tới" hint="Bạn có thể gửi yêu cầu khám ngay để được điều phối bác sĩ khác." />
            ) : (
              <div className="space-y-4">
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {days.map(([k, list]) => (
                    <button key={k} onClick={() => { setDayKey(k); setSlotId(null) }} className={cn('shrink-0 rounded-xl border px-3 py-2 text-center', dayKey === k ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-700')}>
                      <p className="text-xs">{day(list[0].start_at).split(',')[0]}</p>
                      <p className="text-sm font-semibold">{day(list[0].start_at).split(',')[1] || ''}</p>
                      <p className={cn('text-[10px]', dayKey === k ? 'text-teal-100' : 'text-slate-400')}>{list.length} slot</p>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {slotsOfDay.map((s) => (
                    <button key={s.id} onClick={() => setSlotId(s.id)} className={cn('rounded-lg border py-2 text-sm tabular-nums', slotId === s.id ? 'border-teal-700 bg-teal-50 font-semibold text-teal-800' : 'border-slate-200 text-slate-700 hover:border-teal-300')}>
                      {time(s.start_at)}
                    </button>
                  ))}
                </div>
                <Field label="Hình thức khám">
                  <div className="flex gap-2">
                    {d.consultationTypes.map((t) => (
                      <Chip key={t} active={ctype === t} onClick={() => setCtype(t)}>
                        {CTYPE[t]}
                      </Chip>
                    ))}
                  </div>
                </Field>
                <Field label="Mô tả ngắn (không bắt buộc)">
                  <textarea className={inputCls} rows={2} maxLength={500} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="Ví dụ: đau họng 2 ngày, không sốt" />
                </Field>
                <Btn className="w-full" disabled={!slotId} loading={book.isPending} onClick={() => book.mutate()}>
                  {slotId ? `Đặt lịch ${time(slotsOfDay.find((s) => s.id === slotId)?.start_at)} · ${vnd(d.consultationFee)}` : 'Chọn khung giờ'}
                </Btn>
                <p className="text-xs text-slate-500">Mỗi khung giờ chỉ một người đặt được. Bác sĩ sẽ xác nhận lịch trước giờ hẹn.</p>
              </div>
            )}
          </Card>
          {d.schedules.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Lịch làm việc: {[...new Set(d.schedules.map((s) => s.day_of_week))].map((x) => DOW[x]).join(', ')}
            </p>
          )}
        </div>

        <SectionTitle>Đánh giá ({d.totalReviews})</SectionTitle>
        <Card>
          <div className="flex gap-4">
            <div className="text-center">
              <p className="text-3xl font-semibold text-slate-900">{d.rating ? d.rating.toFixed(1) : '—'}</p>
              <Stars value={d.rating} size={12} />
            </div>
            <div className="flex-1 space-y-1">
              {[5, 4, 3, 2, 1].map((s) => {
                const n = d.ratingDistribution[s] || 0
                return (
                  <div key={s} className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="w-3 tabular-nums">{s}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${totalR ? (n / totalR) * 100 : 0}%` }} />
                    </div>
                    <span className="w-5 text-right tabular-nums">{n}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {d.reviews.map((r) => (
              <div key={r.id} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800">{r.patient_name}</span>
                  <span className="text-xs text-slate-400">{relative(r.created_at)}</span>
                </div>
                <Stars value={r.rating} size={12} />
                {r.comment && <p className="mt-1 text-sm text-slate-600">{r.comment}</p>}
              </div>
            ))}
            {!d.reviews.length && <p className="py-3 text-sm text-slate-500">Chưa có đánh giá.</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}
