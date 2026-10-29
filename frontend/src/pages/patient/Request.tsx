import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Building2, ChevronDown, Info, Video, Zap } from 'lucide-react'
import { errorMessage, get, post, ApiError } from '@/lib/http'
import { useMyLocation, useSpecialties } from '@/lib/hooks'
import { ALGO, km } from '@/lib/format'
import MapView from '@/components/MapView'
import LocationBar from '@/components/LocationBar'
import { Btn, Card, Chip, ErrorBox, Field, inputCls, PageHeader, SectionTitle, SpecialtyIcon } from '@/components/kit'
import { cn } from '@/lib/utils'

interface Preview {
  eligibleCount: number
  radiusKm: number
  elapsedMs: number
  ranked: { doctorId: number; name: string; score: number; distanceKm: number }[]
}

/**
 * Khám ngay (On-demand) – mô phỏng gọi xe:
 * chọn chuyên khoa → hình thức → xác nhận vị trí → gửi yêu cầu → Matching Engine + Dispatch.
 */
export default function RequestNow() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const specs = useSpecialties()
  const loc = useMyLocation()
  const [specialtyId, setSpecialtyId] = useState<number | null>(params.get('specialtyId') ? Number(params.get('specialtyId')) : null)
  const [ctype, setCtype] = useState<'ONLINE' | 'IN_PERSON'>('ONLINE')
  const [radius, setRadius] = useState(5)
  const [symptoms, setSymptoms] = useState(params.get('symptoms') || '')
  const [address, setAddress] = useState('')
  const [algorithm, setAlgorithm] = useState('multi')
  const [advanced, setAdvanced] = useState(false)
  const [activeId, setActiveId] = useState<number | null>(null)
  const { lat, lng } = loc.location

  const preview = useQuery({
    queryKey: ['doctors', 'preview', specialtyId, ctype, radius, lat.toFixed(4), lng.toFixed(4), algorithm],
    queryFn: () => get<Preview>(`bookings/preview?specialtyId=${specialtyId}&consultationType=${ctype}&lat=${lat}&lng=${lng}&radiusKm=${radius}&algorithm=${algorithm}`),
    enabled: !!specialtyId,
    staleTime: 15_000,
  })

  const send = useMutation({
    mutationFn: () => post<{ id: number }>('bookings/on-demand', { specialtyId, consultationType: ctype, lat, lng, radiusKm: radius, symptoms: symptoms || undefined, address: address || loc.label, algorithm }),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      nav(`/p/bookings/${b.id}`, { replace: true })
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'ACTIVE_REQUEST') {
        const m = /MG\w+/.exec(e.message)
        toast.error(e.message)
        if (m) get<{ items: { id: number; code: string }[] }>('bookings?scope=active').then((r) => {
          const b = r.items.find((x) => x.code === m[0])
          if (b) setActiveId(b.id)
        })
      } else toast.error(errorMessage(e))
    },
  })

  const sel = specs.data?.find((s) => s.id === specialtyId)
  const p = preview.data

  return (
    <div>
      <PageHeader title="Khám ngay" subtitle="Hệ thống tự tìm và điều phối bác sĩ gần bạn" back />
      <div className="space-y-1 p-4">
        <SectionTitle>1. Chọn chuyên khoa</SectionTitle>
        <div className="grid grid-cols-4 gap-2">
          {(specs.data || []).map((s) => (
            <button key={s.id} onClick={() => setSpecialtyId(s.id)} className={cn('flex flex-col items-center gap-1 rounded-2xl p-2.5 text-center ring-1', specialtyId === s.id ? 'bg-teal-700 text-white ring-teal-700' : 'bg-white text-slate-700 ring-slate-200')}>
              <SpecialtyIcon icon={s.icon} className="h-5 w-5" />
              <span className="text-[11px] font-medium leading-tight">{s.name}</span>
            </button>
          ))}
        </div>
        <button onClick={() => nav('/p/ai')} className="mt-2 text-xs font-semibold text-teal-700">
          Chưa biết khám chuyên khoa nào? Mô tả triệu chứng để được gợi ý →
        </button>

        <SectionTitle>2. Hình thức khám</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {(['ONLINE', 'IN_PERSON'] as const).map((t) => (
            <button key={t} onClick={() => setCtype(t)} className={cn('flex items-center gap-3 rounded-2xl p-3 text-left ring-1', ctype === t ? 'bg-teal-50 ring-2 ring-teal-700' : 'bg-white ring-slate-200')}>
              {t === 'ONLINE' ? <Video className="h-5 w-5 text-teal-700" /> : <Building2 className="h-5 w-5 text-teal-700" />}
              <div>
                <p className="text-sm font-semibold text-slate-900">{t === 'ONLINE' ? 'Khám online' : 'Khám trực tiếp'}</p>
                <p className="text-xs text-slate-500">{t === 'ONLINE' ? 'Chat + gọi video' : 'Tại phòng khám gần bạn'}</p>
              </div>
            </button>
          ))}
        </div>

        <SectionTitle>3. Xác nhận vị trí</SectionTitle>
        <LocationBar loc={loc} />
        <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200">
          <MapView
            center={loc.location}
            radiusKm={radius}
            markers={[]}
            className="h-48 w-full"
            onPick={(pt) => loc.set(pt, 'manual', `Điểm đã chọn trên bản đồ`)}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">Chạm vào bản đồ để chọn vị trí khác.</p>
        <div className="mt-2 flex gap-2">
          {[1, 3, 5, 10].map((r) => (
            <Chip key={r} active={radius === r} onClick={() => setRadius(r)}>
              {r} km
            </Chip>
          ))}
        </div>
        {ctype === 'IN_PERSON' && (
          <Field label="Địa chỉ / ghi chú vị trí">
            <input className={cn(inputCls, 'mt-2')} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Số nhà, tên đường…" maxLength={200} />
          </Field>
        )}

        <SectionTitle>4. Mô tả ngắn (không bắt buộc)</SectionTitle>
        <textarea className={inputCls} rows={2} maxLength={500} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="Ví dụ: đau họng, sốt nhẹ từ hôm qua" />

        <button onClick={() => setAdvanced(!advanced)} className="mt-3 flex items-center gap-1 text-xs font-medium text-slate-500">
          <ChevronDown className={cn('h-3.5 w-3.5 transition', advanced && 'rotate-180')} /> Tùy chọn nghiên cứu (thuật toán matching)
        </button>
        {advanced && (
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(ALGO).map(([k, l]) => (
              <Chip key={k} active={algorithm === k} onClick={() => setAlgorithm(k)}>
                {l}
              </Chip>
            ))}
          </div>
        )}

        <div className="h-4" />
        {specialtyId && (
          <Card className="bg-slate-50">
            {preview.isLoading ? (
              <p className="text-sm text-slate-500">Đang kiểm tra bác sĩ sẵn sàng…</p>
            ) : p ? (
              <div className="text-sm">
                <p className="font-medium text-slate-800">
                  {p.eligibleCount > 0 ? `${p.eligibleCount} bác sĩ ${sel?.name} sẵn sàng trong ${p.radiusKm} km` : 'Chưa có bác sĩ sẵn sàng trong 10 km'}
                </p>
                {p.radiusKm > radius && <p className="text-xs text-amber-700">Không có ai trong {radius} km – hệ thống sẽ tự mở rộng đến {p.radiusKm} km.</p>}
                {p.ranked[0] && (
                  <p className="mt-1 text-xs text-slate-500">
                    Ưu tiên: BS. {p.ranked[0].name} · {km(p.ranked[0].distanceKm)} · {p.ranked[0].score} điểm (tính trong {p.elapsedMs.toFixed(2)} ms)
                  </p>
                )}
              </div>
            ) : null}
          </Card>
        )}
        {activeId && <ErrorBox message="Bạn đang có một yêu cầu khám ngay chưa kết thúc." onRetry={() => nav(`/p/bookings/${activeId}`)} />}
        <p className="flex gap-2 pt-2 text-xs text-slate-500">
          <Info className="h-4 w-4 shrink-0" /> Mỗi bác sĩ có 30 giây để nhận yêu cầu. Nếu bác sĩ từ chối hoặc không phản hồi, hệ thống tự chuyển cho bác sĩ phù hợp tiếp theo.
        </p>
        <div className="sticky bottom-20 pt-3">
          <Btn className="w-full py-3 text-base shadow-lg" disabled={!specialtyId} loading={send.isPending} onClick={() => send.mutate()}>
            <Zap className="h-4 w-4" /> {specialtyId ? `Tìm bác sĩ ${sel?.name}` : 'Chọn chuyên khoa'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
