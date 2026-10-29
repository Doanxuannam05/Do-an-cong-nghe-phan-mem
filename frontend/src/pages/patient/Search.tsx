import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { List, Map as MapIcon, Search as SearchIcon, SlidersHorizontal, X } from 'lucide-react'
import { get } from '@/lib/http'
import { useMyLocation, useSpecialties, type Doctor, type Paged } from '@/lib/hooks'
import MapView, { type MapMarker } from '@/components/MapView'
import LocationBar from '@/components/LocationBar'
import { Btn, Chip, DoctorCard, Empty, ErrorBox, Field, inputCls, Spinner } from '@/components/kit'
import { cn } from '@/lib/utils'

const RADII = [1, 3, 5, 10]
const SORTS = [
  { v: 'recommended', l: 'Đề xuất' },
  { v: 'nearest', l: 'Gần nhất' },
  { v: 'rating', l: 'Đánh giá cao' },
  { v: 'price', l: 'Giá thấp' },
  { v: 'experience', l: 'Kinh nghiệm' },
]

export default function PatientSearch() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const loc = useMyLocation()
  const specs = useSpecialties()
  const [view, setView] = useState<'map' | 'list'>('map')
  const [showFilter, setShowFilter] = useState(false)
  const [q, setQ] = useState(params.get('q') || '')
  const [selected, setSelected] = useState<number | null>(null)

  const f = {
    specialtyId: params.get('specialtyId') || '',
    radius: Number(params.get('radius') || 5),
    sort: params.get('sort') || 'recommended',
    minRating: params.get('minRating') || '',
    maxPrice: params.get('maxPrice') || '',
    type: params.get('type') || '',
    availableOnly: params.get('availableOnly') || '',
    q: params.get('q') || '',
  }
  const setF = (patch: Partial<typeof f>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v === '' || v == null ? next.delete(k) : next.set(k, String(v))))
    setParams(next, { replace: true })
  }

  const { lat, lng } = loc.location
  const qs = new URLSearchParams({ lat: String(lat), lng: String(lng), radius: String(f.radius), sort: f.sort, limit: '60' })
  for (const k of ['specialtyId', 'minRating', 'maxPrice', 'type', 'availableOnly', 'q'] as const) if (f[k]) qs.set(k, f[k])
  const res = useQuery({ queryKey: ['doctors', 'search', qs.toString()], queryFn: () => get<Paged<Doctor> & { onlineCount: number }>(`doctors/nearby?${qs}`), placeholderData: keepPreviousData, staleTime: 30_000 })

  const items = res.data?.items || []
  const markers: MapMarker[] = useMemo(
    () => items.map((d) => ({ id: d.id, lat: d.latitude, lng: d.longitude, kind: d.isAvailableNow ? 'doctor' : 'doctor-off', label: `BS. ${d.fullName} · ${d.specialty?.name}`, onClick: () => setSelected(d.id) })),
    [items],
  )
  const sel = items.find((d) => d.id === selected)
  const activeFilters = [f.minRating, f.maxPrice, f.type, f.availableOnly].filter(Boolean).length

  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-20 space-y-2 border-b border-slate-100 bg-white px-4 pb-3 pt-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setF({ q })
          }}
          className="flex items-center gap-2"
        >
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3">
            <SearchIcon className="h-4 w-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên bác sĩ hoặc phòng khám" className="w-full bg-transparent py-2.5 text-sm outline-none" />
            {q && (
              <button type="button" aria-label="Xóa" onClick={() => { setQ(''); setF({ q: '' }) }}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            )}
          </div>
          <button type="button" aria-label="Bộ lọc" onClick={() => setShowFilter(true)} className="relative rounded-xl bg-slate-100 p-2.5 text-slate-700">
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilters > 0 && <span className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-teal-700 px-1 text-[10px] leading-4 text-white">{activeFilters}</span>}
          </button>
          <button type="button" aria-label="Đổi chế độ xem" onClick={() => setView(view === 'map' ? 'list' : 'map')} className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
            {view === 'map' ? <List className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
          </button>
        </form>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5">
          <select value={f.specialtyId} onChange={(e) => setF({ specialtyId: e.target.value })} className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
            <option value="">Tất cả chuyên khoa</option>
            {specs.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {RADII.map((r) => (
            <Chip key={r} active={f.radius === r} onClick={() => setF({ radius: r })}>
              {r} km
            </Chip>
          ))}
        </div>
      </div>

      {view === 'map' && (
        <div className="relative">
          <MapView center={loc.location} markers={markers} radiusKm={f.radius} className="h-[42vh] w-full" selectedId={selected} onPick={() => setSelected(null)} />
          <div className="absolute left-3 right-3 top-3 z-[400]">
            <LocationBar loc={loc} compact />
          </div>
          <div className="absolute bottom-3 left-3 z-[400] rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-slate-700 shadow">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
            {res.data?.onlineCount ?? 0} sẵn sàng · {res.data?.total ?? 0} bác sĩ trong {f.radius} km
          </div>
        </div>
      )}

      <div className="flex-1 px-4 pb-4">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-3">
          {SORTS.map((s) => (
            <Chip key={s.v} active={f.sort === s.v} onClick={() => setF({ sort: s.v })}>
              {s.l}
            </Chip>
          ))}
        </div>
        {sel && (
          <div className="mb-3">
            <DoctorCard d={sel} onClick={() => nav(`/p/doctors/${sel.id}`)} action={<Btn className="w-full py-2" onClick={(e) => { e.stopPropagation(); nav(`/p/doctors/${sel.id}?book=1`) }}>Đặt khám</Btn>} />
          </div>
        )}
        {res.isError ? (
          <ErrorBox message="Không tải được danh sách bác sĩ." onRetry={() => res.refetch()} />
        ) : res.isLoading ? (
          <Spinner />
        ) : !items.length ? (
          <Empty title="Không có bác sĩ phù hợp" hint="Thử tăng bán kính hoặc bỏ bớt bộ lọc." action={<Btn variant="secondary" onClick={() => setF({ radius: 10, minRating: '', maxPrice: '', type: '', availableOnly: '' })}>Mở rộng 10 km</Btn>} />
        ) : (
          <div className={cn('space-y-2', res.isFetching && 'opacity-70')}>
            {f.sort === 'recommended' && <p className="text-xs text-slate-500">"Đề xuất" xếp hạng theo Matching Score: khoảng cách, chuyên khoa, mức sẵn sàng, đánh giá và kinh nghiệm.</p>}
            {items.filter((d) => d.id !== selected).map((d) => (
              <DoctorCard key={d.id} d={d} compact onClick={() => nav(`/p/doctors/${d.id}`)} />
            ))}
          </div>
        )}
      </div>

      {showFilter && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40" onClick={() => setShowFilter(false)}>
          <div className="w-full max-w-md space-y-4 rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Bộ lọc</h2>
              <button aria-label="Đóng" onClick={() => setShowFilter(false)}>
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <Field label="Đánh giá tối thiểu">
              <div className="flex gap-2">
                {['', '4', '4.5'].map((v) => (
                  <Chip key={v} active={f.minRating === v} onClick={() => setF({ minRating: v })}>
                    {v ? `${v}★ trở lên` : 'Tất cả'}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label="Phí khám tối đa">
              <select className={inputCls} value={f.maxPrice} onChange={(e) => setF({ maxPrice: e.target.value })}>
                <option value="">Không giới hạn</option>
                <option value="200000">Đến 200.000đ</option>
                <option value="300000">Đến 300.000đ</option>
                <option value="400000">Đến 400.000đ</option>
              </select>
            </Field>
            <Field label="Hình thức khám">
              <div className="flex gap-2">
                {[['', 'Tất cả'], ['ONLINE', 'Online'], ['IN_PERSON', 'Trực tiếp']].map(([v, l]) => (
                  <Chip key={v} active={f.type === v} onClick={() => setF({ type: v })}>
                    {l}
                  </Chip>
                ))}
              </div>
            </Field>
            <label className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-sm">
              <span className="font-medium text-slate-700">Chỉ bác sĩ đang sẵn sàng</span>
              <input type="checkbox" className="h-4 w-4 accent-teal-700" checked={f.availableOnly === 'true'} onChange={(e) => setF({ availableOnly: e.target.checked ? 'true' : '' })} />
            </label>
            <Btn className="w-full" onClick={() => setShowFilter(false)}>
              Xem {res.data?.total ?? 0} bác sĩ
            </Btn>
          </div>
        </div>
      )}
    </div>
  )
}
