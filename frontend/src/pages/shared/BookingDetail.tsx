import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Building2, CheckCircle2, CircleDot, ClipboardList, Flag, MapPin, MessageCircle, Phone, Radar, RefreshCw, Stethoscope, Video, Wallet, XCircle, Timer,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { errorMessage, get, patch, post } from '@/lib/http'
import { ALGO, BTYPE, CTYPE, PAY_METHOD, dateTime, km, time, vnd } from '@/lib/format'
import type { Doctor } from '@/lib/hooks'
import MapView from '@/components/MapView'
import { Avatar, Btn, Card, CountdownRing, ErrorBox, Field, inputCls, PageHeader, RatingInline, SectionTitle, Spinner, Stars, StatusBadge } from '@/components/kit'
import { cn } from '@/lib/utils'

interface Offer {
  id: number
  doctor_id: number
  doctor_name?: string
  rank: number
  score: number | null
  distance_km: number | null
  status: string
  offered_at: string
  expires_at: string
  responded_at: string | null
  response_ms: number | null
  reason: string | null
}
interface Candidate {
  rank: number
  doctorId: number
  name: string
  score: number
  distanceKm: number
  components: Record<string, number>
  skipped?: string
}
export interface BookingDetailData {
  id: number
  code: string
  type: 'SCHEDULED' | 'ON_DEMAND'
  consultationType: 'ONLINE' | 'IN_PERSON'
  status: string
  specialtyId: number
  specialtyName: string
  scheduledAt: string | null
  createdAt: string
  acceptedAt: string | null
  startedAt: string | null
  completedAt: string | null
  symptoms: string | null
  address: string | null
  cancelReason: string | null
  patientLocation: { lat: number; lng: number } | null
  fee: number | null
  distanceKm: number | null
  algorithm: string | null
  searchRadiusKm: number | null
  matchingMs: number | null
  candidates: { list: Candidate[]; eligible?: number; pool?: number; computeMs?: number; weights?: Record<string, number>; radiusKm?: number } | null
  patient: { fullName: string; phone: string | null; gender: string | null; age: number | null }
  doctor: Doctor | null
  timeline: { id: number; from_status: string | null; to_status: string; note: string | null; created_at: string }[]
  offers: Offer[]
  notes: { notes: string | null; advice: string | null; follow_up: string | null; created_at: string } | null
  payment: { id: number; amount: number; method: string; status: string; transaction_ref: string | null; paid_at: string | null } | null
  review: { id: number; rating: number; comment: string | null } | null
  consultation: { started_at: string; ended_at: string | null } | null
  conversationId: number | null
  myOffer: Offer | null
  dispatchEvents?: { event: string; at: string; doctorName?: string; rank?: number; score?: number; distanceKm?: number; responseMs?: number; reason?: string | null; triedDoctors?: number }[]
  permissions: Record<'canCancel' | 'canVideo' | 'canChat' | 'canStart' | 'canComplete' | 'canPay' | 'canReview' | 'canRespond', boolean>
}

const SEARCHING = ['PENDING', 'SEARCHING', 'OFFERED']
const EVENT_LABEL: Record<string, string> = { OFFERED: 'Gửi lời mời', ACCEPTED: 'Bác sĩ nhận', REJECTED: 'Bác sĩ từ chối', EXPIRED: 'Hết 30s – tự từ chối', NO_DOCTOR_FOUND: 'Không tìm được bác sĩ', CANCELLED_BY_PATIENT: 'Người bệnh hủy' }
const W_LABEL: Record<string, string> = { distance: 'Khoảng cách', specialty: 'Chuyên khoa', availability: 'Sẵn sàng', rating: 'Đánh giá', experience: 'Kinh nghiệm' }

export default function BookingDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const base = user?.role === 'DOCTOR' ? '/d' : user?.role === 'ADMIN' ? '/a' : '/p'
  const q = useQuery({
    queryKey: ['booking', Number(id)],
    queryFn: () => get<BookingDetailData>(`bookings/${id}`),
    refetchInterval: (query) => (SEARCHING.includes(query.state.data?.status || '') ? 10_000 : false),
    staleTime: 5_000,
  })
  const b = q.data
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['booking', Number(id)] })
    qc.invalidateQueries({ queryKey: ['bookings'] })
    qc.invalidateQueries({ queryKey: ['doctor-stats'] })
    qc.invalidateQueries({ queryKey: ['doctor-requests'] })
  }

  const act = useMutation({
    mutationFn: async ({ kind, body }: { kind: string; body?: unknown }) => {
      const map: Record<string, () => Promise<unknown>> = {
        cancel: () => patch(`bookings/${id}/cancel`, body),
        accept: () => post(`bookings/${id}/accept`),
        reject: () => post(`bookings/${id}/reject`, body),
        start: () => post(`consultations/${id}/start`),
        end: () => post(`consultations/${id}/end`, body),
        pay: () => post('payments', body),
        review: () => post('reviews', body),
        confirmCash: () => patch(`payments/${b?.payment?.id}`, { status: 'SUCCESS' }),
        retry: () => post<{ id: number }>('bookings/on-demand', body),
      }
      return map[kind]()
    },
    onSuccess: (r, v) => {
      const msg: Record<string, string> = { cancel: 'Đã hủy lịch', accept: 'Đã nhận ca khám', reject: 'Đã từ chối', start: 'Đã bắt đầu phiên khám', end: 'Đã kết thúc phiên khám', review: 'Cảm ơn bạn đã đánh giá', confirmCash: 'Đã xác nhận thu tiền' }
      if (v.kind === 'pay') {
        const st = (r as { status: string }).status
        if (st === 'SUCCESS') toast.success('Thanh toán thành công')
        else if (st === 'FAILED') toast.error('Thanh toán thất bại (giả lập). Thử lại.')
        else toast('Đã ghi nhận – bác sĩ sẽ xác nhận khi nhận tiền')
      } else if (v.kind === 'retry') {
        nav(`${base}/bookings/${(r as { id: number }).id}`, { replace: true })
      } else toast.success(msg[v.kind])
      refresh()
      setSheet(null)
    },
    onError: (e) => {
      toast.error(errorMessage(e))
      refresh()
    },
  })
  const [sheet, setSheet] = useState<null | 'cancel' | 'end' | 'pay' | 'review' | 'complaint'>(null)

  if (q.isLoading) return <><PageHeader title="Chi tiết lịch khám" back /><Spinner /></>
  if (q.isError || !b) return <><PageHeader title="Chi tiết lịch khám" back /><div className="p-4"><ErrorBox message={errorMessage(q.error)} onRetry={() => q.refetch()} /></div></>

  const isPatient = user?.role === 'PATIENT'
  const isDoctor = user?.role === 'DOCTOR'
  const p = b.permissions
  const searching = SEARCHING.includes(b.status) && b.type === 'ON_DEMAND'

  return (
    <div className="pb-6">
      <PageHeader title={`${BTYPE[b.type]} · ${b.code}`} subtitle={`${b.specialtyName} · ${CTYPE[b.consultationType]}`} back right={<StatusBadge status={b.status} />} />
      <div className="space-y-3 p-4">
        {isPatient && searching && <SearchingPanel b={b} />}

        {b.status === 'NO_DOCTOR_FOUND' && isPatient && (
          <Card className="border-rose-200 bg-rose-50/50">
            <p className="font-semibold text-rose-900">Chưa tìm được bác sĩ nhận yêu cầu</p>
            <p className="mt-1 text-sm text-rose-800">Đã thử {b.offers.length} bác sĩ trong {b.searchRadiusKm} km. Bạn có thể thử lại với bán kính 10 km hoặc đặt lịch hẹn.</p>
            {b.patientLocation && (
              <Btn
                className="mt-3 w-full"
                loading={act.isPending}
                onClick={() => act.mutate({ kind: 'retry', body: { specialtyId: b.specialtyId, consultationType: b.consultationType, lat: b.patientLocation!.lat, lng: b.patientLocation!.lng, radiusKm: 10, symptoms: b.symptoms || undefined, address: b.address || undefined } })}
              >
                <RefreshCw className="h-4 w-4" /> Thử lại trong 10 km
              </Btn>
            )}
          </Card>
        )}

        {isDoctor && p.canRespond && b.myOffer && (
          <Card className="border-amber-200 bg-amber-50/60">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-amber-900">{b.type === 'ON_DEMAND' ? 'Yêu cầu khám ngay đang chờ bạn' : 'Lịch hẹn cần bạn xác nhận'}</p>
                <p className="text-sm text-amber-800">{b.type === 'SCHEDULED' ? `Hẹn lúc ${dateTime(b.scheduledAt)}` : `Cách bạn ${km(b.myOffer.distance_km)}`}</p>
              </div>
              {b.type === 'ON_DEMAND' && <CountdownRing until={b.myOffer.expires_at} total={30} />}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Btn variant="outline" disabled={act.isPending} onClick={() => act.mutate({ kind: 'reject', body: { reason: 'Bác sĩ bận' } })}>Từ chối</Btn>
              <Btn loading={act.isPending} onClick={() => act.mutate({ kind: 'accept' })}>Nhận</Btn>
            </div>
          </Card>
        )}

        {/* Bác sĩ (góc nhìn người bệnh/admin) */}
        {b.doctor && !isDoctor && (
          <Card onClick={isPatient ? () => nav(`/p/doctors/${b.doctor!.id}`) : undefined}>
            <div className="flex items-center gap-3">
              <Avatar src={b.doctor.avatar} doctor size={52} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">BS. {b.doctor.fullName}</p>
                <p className="text-sm text-slate-600">{b.doctor.specialty?.name} · {b.doctor.experienceYears} năm KN</p>
                <div className="mt-0.5 flex items-center gap-3 text-sm">
                  <RatingInline rating={b.doctor.rating} total={b.doctor.totalReviews} />
                  {b.distanceKm != null && <span className="text-slate-600"><MapPin className="mr-0.5 inline h-3.5 w-3.5" />{km(b.distanceKm)}</span>}
                </div>
              </div>
            </div>
            {b.doctor.clinic && <p className="mt-3 text-sm text-slate-600"><Building2 className="mr-1 inline h-4 w-4 text-slate-400" />{b.doctor.clinic.name} – {b.doctor.clinic.address}</p>}
            {b.doctor.isSimulated && ['CONFIRMED', 'IN_PROGRESS'].includes(b.status) && (
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Đây là bác sĩ mô phỏng: tự trả lời tin nhắn mẫu, tự bắt đầu và kết thúc phiên khám sau khoảng 2–3 phút. Gọi video cần đăng nhập tài khoản bác sĩ demo ở một trình duyệt khác.</p>
            )}
          </Card>
        )}

        {/* Người bệnh (góc nhìn bác sĩ/admin) */}
        {!isPatient && (
          <Card>
            <p className="text-xs font-medium text-slate-500">Người bệnh</p>
            <div className="mt-1 flex items-center gap-3">
              <Avatar size={44} />
              <div className="flex-1">
                <p className="font-semibold text-slate-900">{b.patient.fullName}</p>
                <p className="text-sm text-slate-600">
                  {[b.patient.gender === 'MALE' ? 'Nam' : b.patient.gender === 'FEMALE' ? 'Nữ' : null, b.patient.age != null ? `${b.patient.age} tuổi` : null].filter(Boolean).join(' · ') || 'Thông tin được ẩn đến khi bạn nhận ca'}
                </p>
              </div>
              {b.patient.phone && (
                <a href={`tel:${b.patient.phone}`} className="rounded-full bg-teal-50 p-2 text-teal-700" aria-label="Gọi điện">
                  <Phone className="h-4 w-4" />
                </a>
              )}
            </div>
          </Card>
        )}

        <Card>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Thời gian" value={b.type === 'SCHEDULED' ? dateTime(b.scheduledAt) : `Gửi lúc ${dateTime(b.createdAt)}`} />
            <Info label="Phí khám" value={vnd(b.fee ?? b.doctor?.consultationFee)} />
            <Info label="Hình thức" value={CTYPE[b.consultationType]} />
            <Info label="Chuyên khoa" value={b.specialtyName} />
          </div>
          {b.symptoms && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><span className="text-xs text-slate-500">Mô tả: </span>{b.symptoms}</p>}
          {b.address && b.consultationType === 'IN_PERSON' && <p className="mt-2 text-sm text-slate-600"><MapPin className="mr-1 inline h-4 w-4" />{b.address}</p>}
          {b.cancelReason && <p className="mt-2 text-sm text-slate-600">Lý do hủy: {b.cancelReason}</p>}
        </Card>

        {/* Hành động */}
        <div className="grid grid-cols-2 gap-2">
          {p.canChat && b.conversationId && (
            <Btn variant="secondary" onClick={() => nav(`${base}/chats/${b.conversationId}`)}><MessageCircle className="h-4 w-4" /> Nhắn tin</Btn>
          )}
          {p.canVideo && <Btn variant="secondary" onClick={() => nav(`${base}/call/${b.id}`)}><Video className="h-4 w-4" /> Gọi video</Btn>}
          {p.canStart && <Btn className="col-span-2" loading={act.isPending} onClick={() => act.mutate({ kind: 'start' })}><Stethoscope className="h-4 w-4" /> Bắt đầu phiên khám</Btn>}
          {p.canComplete && <Btn className="col-span-2" onClick={() => setSheet('end')}><CheckCircle2 className="h-4 w-4" /> Kết thúc & ghi nhận kết quả</Btn>}
          {p.canPay && <Btn className={cn(b.status === 'COMPLETED' && 'col-span-2')} variant={b.status === 'COMPLETED' ? 'primary' : 'outline'} onClick={() => setSheet('pay')}><Wallet className="h-4 w-4" /> Thanh toán {vnd(b.fee)}</Btn>}
          {p.canReview && <Btn className="col-span-2" variant="secondary" onClick={() => setSheet('review')}>Đánh giá bác sĩ</Btn>}
          {isDoctor && b.payment?.status === 'PENDING' && ['CASH', 'BANK_TRANSFER'].includes(b.payment.method) && b.status === 'COMPLETED' && (
            <Btn className="col-span-2" variant="outline" loading={act.isPending} onClick={() => act.mutate({ kind: 'confirmCash' })}>Xác nhận đã nhận {vnd(b.payment.amount)} ({PAY_METHOD[b.payment.method]})</Btn>
          )}
          {p.canCancel && <Btn variant="ghost" className="text-rose-700" onClick={() => setSheet('cancel')}><XCircle className="h-4 w-4" /> Hủy</Btn>}
          {isPatient && ['COMPLETED', 'CANCELLED', 'CONFIRMED', 'IN_PROGRESS'].includes(b.status) && (
            <Btn variant="ghost" className="text-slate-500" onClick={() => setSheet('complaint')}><Flag className="h-4 w-4" /> Báo cáo</Btn>
          )}
        </div>
        {b.status === 'IN_PROGRESS' && b.consultation && (
          <p className="flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-800"><Timer className="h-4 w-4" /> Phiên khám bắt đầu lúc {time(b.consultation.started_at)}</p>
        )}

        {b.notes && (
          <>
            <SectionTitle>Kết quả buổi khám</SectionTitle>
            <Card className="space-y-2 text-sm">
              {b.notes.notes && <Note label="Ghi chú của bác sĩ" text={b.notes.notes} />}
              {b.notes.advice && <Note label="Lời khuyên chung" text={b.notes.advice} />}
              {b.notes.follow_up && <Note label="Đề xuất tái khám" text={b.notes.follow_up} />}
              <p className="pt-1 text-xs text-slate-400">Ghi chú do bác sĩ cung cấp, không phải chẩn đoán tự động của hệ thống.</p>
            </Card>
          </>
        )}

        {b.payment && (
          <Card className="flex items-center justify-between text-sm">
            <div>
              <p className="text-xs text-slate-500">Thanh toán · {PAY_METHOD[b.payment.method]}</p>
              <p className="font-semibold text-slate-900">{vnd(b.payment.amount)}</p>
              {b.payment.transaction_ref && <p className="text-xs text-slate-400">Mã GD: {b.payment.transaction_ref}</p>}
            </div>
            <StatusBadge status={b.payment.status} />
          </Card>
        )}
        {b.review && (
          <Card className="text-sm">
            <p className="text-xs text-slate-500">Đánh giá của {isPatient ? 'bạn' : 'người bệnh'}</p>
            <Stars value={b.review.rating} />
            {b.review.comment && <p className="mt-1 text-slate-700">{b.review.comment}</p>}
          </Card>
        )}

        {/* Bản đồ */}
        {b.patientLocation && b.doctor && (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <MapView center={b.patientLocation} markers={[{ id: b.doctor.id, lat: b.doctor.latitude, lng: b.doctor.longitude, kind: 'doctor', label: `BS. ${b.doctor.fullName}` }]} fitMarkers className="h-44 w-full" />
          </div>
        )}

        {/* Nghiên cứu: chi tiết matching + dispatch */}
        {b.type === 'ON_DEMAND' && b.candidates?.list && !isDoctor && <MatchingDetails b={b} />}

        <SectionTitle>Tiến trình</SectionTitle>
        <Card>
          <ol className="relative space-y-3 border-l border-slate-200 pl-4">
            {b.timeline.map((t) => (
              <li key={t.id} className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-teal-600 ring-4 ring-white" />
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={t.to_status} />
                  <span className="text-xs tabular-nums text-slate-400">{dateTime(t.created_at)}</span>
                </div>
                {t.note && <p className="mt-1 text-sm text-slate-600">{t.note}</p>}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {sheet && (
        <Sheet onClose={() => setSheet(null)} title={{ cancel: 'Hủy lịch khám', end: 'Kết thúc phiên khám', pay: 'Thanh toán', review: 'Đánh giá bác sĩ', complaint: 'Báo cáo vấn đề' }[sheet]}>
          {sheet === 'cancel' && <CancelForm loading={act.isPending} onSubmit={(reason) => act.mutate({ kind: 'cancel', body: { reason } })} />}
          {sheet === 'end' && <EndForm loading={act.isPending} onSubmit={(body) => act.mutate({ kind: 'end', body })} />}
          {sheet === 'pay' && <PayForm amount={b.fee || 0} loading={act.isPending} onSubmit={(method, simulateFailure) => act.mutate({ kind: 'pay', body: { bookingId: b.id, method, simulateFailure } })} />}
          {sheet === 'review' && <ReviewForm loading={act.isPending} onSubmit={(rating, comment) => act.mutate({ kind: 'review', body: { bookingId: b.id, rating, comment } })} />}
          {sheet === 'complaint' && <ComplaintForm bookingId={b.id} onDone={() => setSheet(null)} />}
        </Sheet>
      )}
    </div>
  )
}

const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <p className="text-xs text-slate-500">{label}</p>
    <p className="font-medium text-slate-800">{value}</p>
  </div>
)
const Note = ({ label, text }: { label: string; text: string }) => (
  <div>
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className="whitespace-pre-line text-slate-800">{text}</p>
  </div>
)

/** Màn hình "đang tìm bác sĩ" giống Grab: radar + bác sĩ đang được mời + đồng hồ 30s */
function SearchingPanel({ b }: { b: BookingDetailData }) {
  const current = [...b.offers].reverse().find((o) => o.status === 'OFFERED')
  const list = b.candidates?.list || []
  return (
    <Card className="overflow-hidden border-teal-200 p-0">
      <div className="flex items-center gap-4 bg-teal-700 p-4 text-white">
        <div className="relative flex h-14 w-14 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-white/30" />
          <span className="absolute inset-2 rounded-full bg-white/20" />
          <Radar className="relative h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{current ? 'Đang chờ bác sĩ phản hồi…' : 'Đang tìm bác sĩ phù hợp…'}</p>
          <p className="text-sm text-teal-100">{current ? `Mời BS. ${current.doctor_name} (#${current.rank}) · cách ${km(current.distance_km)}` : `Matching Engine đang xếp hạng bác sĩ trong ${b.searchRadiusKm || 5} km`}</p>
        </div>
        {current && <div className="rounded-full bg-white p-0.5"><CountdownRing until={current.expires_at} total={30} size={52} /></div>}
      </div>
      <div className="divide-y divide-slate-100">
        {list.map((c) => {
          const o = b.offers.find((x) => x.doctor_id === c.doctorId)
          const st = o?.status || (c.skipped ? 'SKIPPED' : 'WAITING')
          return (
            <div key={c.doctorId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-5 text-center text-xs font-semibold text-slate-400">#{c.rank}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-800">BS. {c.name}</p>
                <p className="text-xs text-slate-500">{km(c.distanceKm)} · {c.score} điểm</p>
              </div>
              <OfferState status={st} ms={o?.response_ms} />
            </div>
          )
        })}
        {!list.length && <p className="px-4 py-3 text-sm text-slate-500">Đang tính toán danh sách ứng viên…</p>}
      </div>
    </Card>
  )
}

function OfferState({ status, ms }: { status: string; ms?: number | null }) {
  const map: Record<string, [string, string]> = {
    OFFERED: ['Đang mời', 'text-amber-700'],
    ACCEPTED: ['Đã nhận', 'text-emerald-700'],
    REJECTED: [`Từ chối${ms ? ` · ${(ms / 1000).toFixed(0)}s` : ''}`, 'text-rose-700'],
    EXPIRED: ['Hết 30s', 'text-slate-500'],
    CANCELLED: ['Không sẵn sàng', 'text-slate-400'],
    SKIPPED: ['Bỏ qua', 'text-slate-400'],
    WAITING: ['Chờ lượt', 'text-slate-400'],
  }
  const [l, c] = map[status] || [status, 'text-slate-500']
  return <span className={cn('flex items-center gap-1 text-xs font-medium', c)}>{status === 'OFFERED' && <CircleDot className="h-3 w-3 animate-pulse" />}{l}</span>
}

/** Bảng giải thích kết quả matching (phục vụ nghiên cứu) */
function MatchingDetails({ b }: { b: BookingDetailData }) {
  const [open, setOpen] = useState(false)
  const c = b.candidates!
  return (
    <Card>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><ClipboardList className="h-4 w-4 text-teal-700" /> Chi tiết Matching Engine</span>
        <span className="text-xs text-teal-700">{open ? 'Thu gọn' : 'Xem'}</span>
      </button>
      <p className="mt-1 text-xs text-slate-500">
        {ALGO[b.algorithm || 'multi']} · {c.eligible ?? '—'} bác sĩ đủ điều kiện · bán kính {b.searchRadiusKm} km · tính toán {c.computeMs != null ? `${c.computeMs.toFixed(2)} ms` : '—'}
      </p>
      {open && (
        <div className="mt-3 space-y-3">
          {c.weights && (
            <p className="text-xs text-slate-600">
              Score = {Object.entries(c.weights).map(([k, v]) => `${v.toFixed(2)}×${W_LABEL[k]}`).join(' + ')}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100 text-left">
                  <th className="py-1.5 pr-2">#</th>
                  <th className="pr-2">Bác sĩ</th>
                  {Object.keys(W_LABEL).map((k) => <th key={k} className="pr-2 text-right">{W_LABEL[k]}</th>)}
                  <th className="text-right">Điểm</th>
                </tr>
              </thead>
              <tbody className="tabular-nums text-slate-700">
                {c.list.map((x) => (
                  <tr key={x.doctorId} className="border-b border-slate-50">
                    <td className="py-1.5 pr-2">{x.rank}</td>
                    <td className="max-w-24 truncate pr-2">{x.name}</td>
                    {Object.keys(W_LABEL).map((k) => <td key={k} className="pr-2 text-right">{x.components[k]?.toFixed(2)}</td>)}
                    <td className="text-right font-semibold">{x.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Nhật ký điều phối</p>
            {b.dispatchEvents?.length
              ? b.dispatchEvents.map((e, i) => (
                  <p key={i} className="text-xs text-slate-600">
                    {time(e.at)} · <b>{EVENT_LABEL[e.event] || e.event}</b>
                    {e.doctorName && ` · #${e.rank ?? '–'} ${e.doctorName}`}
                    {e.score != null && ` · ${e.score} điểm`}
                    {e.responseMs != null && ` · sau ${(e.responseMs / 1000).toFixed(1)}s`}
                    {e.triedDoctors != null && ` · đã thử ${e.triedDoctors} bác sĩ`}
                  </p>
                ))
              : b.offers.map((o) => (
                  <p key={o.id} className="text-xs text-slate-600">
                    {time(o.offered_at)} · #{o.rank} {o.doctor_name}: <b>{o.status}</b>
                    {o.response_ms != null && ` sau ${(o.response_ms / 1000).toFixed(1)}s`}
                  </p>
                ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-sm text-slate-500">Đóng</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function CancelForm({ onSubmit, loading }: { onSubmit: (r: string) => void; loading: boolean }) {
  const [r, setR] = useState('')
  const quick = ['Tôi đã khỏe hơn', 'Muốn đổi giờ khác', 'Chờ quá lâu', 'Đặt nhầm']
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {quick.map((x) => <button key={x} onClick={() => setR(x)} className={cn('rounded-full border px-3 py-1 text-sm', r === x ? 'border-teal-700 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600')}>{x}</button>)}
      </div>
      <textarea className={inputCls} rows={2} value={r} onChange={(e) => setR(e.target.value)} placeholder="Lý do (không bắt buộc)" maxLength={300} />
      <Btn variant="danger" className="w-full" loading={loading} onClick={() => onSubmit(r)}>Xác nhận hủy</Btn>
    </div>
  )
}

function EndForm({ onSubmit, loading }: { onSubmit: (b: { notes: string; advice: string; followUp: string }) => void; loading: boolean }) {
  const [f, setF] = useState({ notes: '', advice: '', followUp: '' })
  return (
    <div className="space-y-3">
      <Field label="Ghi chú buổi khám"><textarea className={inputCls} rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={2000} /></Field>
      <Field label="Lời khuyên chung"><textarea className={inputCls} rows={2} value={f.advice} onChange={(e) => setF({ ...f, advice: e.target.value })} maxLength={2000} /></Field>
      <Field label="Đề xuất tái khám"><input className={inputCls} value={f.followUp} onChange={(e) => setF({ ...f, followUp: e.target.value })} maxLength={300} placeholder="Ví dụ: tái khám sau 1 tuần" /></Field>
      <p className="text-xs text-slate-500">Người bệnh sẽ xem được các ghi chú này. Hệ thống không tự đưa ra chẩn đoán.</p>
      <Btn className="w-full" loading={loading} onClick={() => onSubmit(f)}>Hoàn thành phiên khám</Btn>
    </div>
  )
}

function PayForm({ amount, onSubmit, loading }: { amount: number; onSubmit: (m: string, fail?: boolean) => void; loading: boolean }) {
  const [m, setM] = useState('MOCK_PAYMENT')
  const [fail, setFail] = useState(false)
  const desc: Record<string, string> = { MOCK_PAYMENT: 'Cổng thanh toán giả lập, xác nhận ngay', BANK_TRANSFER: 'Bác sĩ xác nhận khi nhận được tiền', CASH: 'Trả trực tiếp cho bác sĩ' }
  return (
    <div className="space-y-3">
      <p className="text-2xl font-semibold text-slate-900">{vnd(amount)}</p>
      {Object.keys(PAY_METHOD).reverse().map((k) => (
        <button key={k} onClick={() => setM(k)} className={cn('flex w-full items-center justify-between rounded-xl border p-3 text-left', m === k ? 'border-teal-700 bg-teal-50' : 'border-slate-200')}>
          <span>
            <span className="block text-sm font-semibold text-slate-800">{PAY_METHOD[k]}</span>
            <span className="text-xs text-slate-500">{desc[k]}</span>
          </span>
          <span className={cn('h-4 w-4 rounded-full border-2', m === k ? 'border-teal-700 bg-teal-700' : 'border-slate-300')} />
        </button>
      ))}
      {m === 'MOCK_PAYMENT' && (
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} className="accent-teal-700" /> Mô phỏng giao dịch thất bại (kiểm thử)
        </label>
      )}
      <Btn className="w-full" loading={loading} onClick={() => onSubmit(m, fail)}>Thanh toán</Btn>
      <p className="text-xs text-slate-500">Prototype – không phát sinh giao dịch thật. Có thể tích hợp VNPay/MoMo ở phiên bản sau.</p>
    </div>
  )
}

function ReviewForm({ onSubmit, loading }: { onSubmit: (r: number, c: string) => void; loading: boolean }) {
  const [r, setR] = useState(0)
  const [c, setC] = useState('')
  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-2 py-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} aria-label={`${i} sao`} onClick={() => setR(i)}>
            <svg width="36" height="36" viewBox="0 0 24 24" className={i <= r ? 'fill-amber-400 text-amber-400' : 'fill-none text-slate-300'} stroke="currentColor" strokeWidth="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
          </button>
        ))}
      </div>
      <textarea className={inputCls} rows={3} value={c} onChange={(e) => setC(e.target.value)} placeholder="Chia sẻ trải nghiệm của bạn (không bắt buộc)" maxLength={1000} />
      <Btn className="w-full" disabled={!r} loading={loading} onClick={() => onSubmit(r, c)}>Gửi đánh giá</Btn>
      <p className="text-xs text-slate-500">Mỗi lịch khám chỉ được đánh giá một lần. Điểm đánh giá được dùng trong thuật toán gợi ý bác sĩ.</p>
    </div>
  )
}

function ComplaintForm({ bookingId, onDone }: { bookingId: number; onDone: () => void }) {
  const [t, setT] = useState('BOOKING')
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const m = useMutation({
    mutationFn: () => post('complaints', { targetType: t, bookingId, title, description: desc }),
    onSuccess: () => {
      toast.success('Đã gửi báo cáo. Quản trị viên sẽ xử lý sớm.')
      onDone()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {[['DOCTOR', 'Bác sĩ'], ['BOOKING', 'Lịch khám'], ['PAYMENT', 'Thanh toán'], ['SERVICE', 'Dịch vụ']].map(([k, l]) => (
          <button key={k} onClick={() => setT(k)} className={cn('rounded-full border px-3 py-1 text-sm', t === k ? 'border-teal-700 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600')}>{l}</button>
        ))}
      </div>
      <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tiêu đề (tối thiểu 5 ký tự)" maxLength={120} />
      <textarea className={inputCls} rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Mô tả chi tiết" maxLength={2000} />
      <Btn className="w-full" disabled={title.trim().length < 5} loading={m.isPending} onClick={() => m.mutate()}>Gửi báo cáo</Btn>
    </div>
  )
}
