import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Search, Sparkles, Zap } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { get } from '@/lib/http'
import { useMyLocation, useSpecialties, type Doctor, type Paged } from '@/lib/hooks'
import { BTYPE, dateTime } from '@/lib/format'
import { HeaderActions } from '@/components/layouts'
import LocationBar from '@/components/LocationBar'
import { Btn, DoctorCard, Empty, SectionTitle, SpecialtyIcon, Spinner, StatusBadge } from '@/components/kit'

interface BookingRow {
  id: number
  code: string
  type: string
  status: string
  scheduled_at: string | null
  created_at: string
  specialty_name: string
  doctor: { fullName: string } | null
}

export default function PatientHome() {
  const { user } = useAuth()
  const nav = useNavigate()
  const loc = useMyLocation()
  const specs = useSpecialties()
  const { lat, lng } = loc.location
  const nearby = useQuery({
    queryKey: ['doctors', 'home', lat.toFixed(4), lng.toFixed(4)],
    queryFn: () => get<Paged<Doctor>>(`doctors/nearby?lat=${lat}&lng=${lng}&radius=5&sort=recommended&availableOnly=true&limit=5`),
    staleTime: 60_000,
  })
  const active = useQuery({ queryKey: ['bookings', 'active'], queryFn: () => get<Paged<BookingRow>>('bookings?scope=active&limit=3'), staleTime: 30_000 })

  return (
    <div>
      <div className="bg-white px-4 pb-5 pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500">Xin chào,</p>
            <h1 className="text-xl font-semibold text-slate-900">{user?.fullName}</h1>
          </div>
          <HeaderActions notificationsPath="/p/notifications" />
        </div>
        <p className="mt-3 text-base font-medium text-slate-800">Bạn cần hỗ trợ gì?</p>
        <button onClick={() => nav('/p/search')} className="mt-2 flex w-full items-center gap-2 rounded-xl bg-slate-100 px-3 py-3 text-left text-sm text-slate-500">
          <Search className="h-4 w-4" /> Tìm bác sĩ, chuyên khoa, phòng khám…
        </button>
        <div className="mt-3">
          <LocationBar loc={loc} compact />
        </div>
      </div>

      <div className="px-4">
        {(active.data?.items || []).map((b) => (
          <button key={b.id} onClick={() => nav(`/p/bookings/${b.id}`)} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50/60 p-3 text-left">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StatusBadge status={b.status} />
                <span className="text-xs text-slate-500">{BTYPE[b.type]} · {b.code}</span>
              </div>
              <p className="mt-1 truncate text-sm font-medium text-slate-800">
                {b.specialty_name}
                {b.doctor ? ` · BS. ${b.doctor.fullName}` : ''}
              </p>
              {b.scheduled_at && <p className="text-xs text-slate-500">{dateTime(b.scheduled_at)}</p>}
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>
        ))}

        <div className="mt-4 grid grid-cols-5 gap-2">
          <button onClick={() => nav('/p/request')} className="col-span-3 flex flex-col justify-between rounded-2xl bg-teal-700 p-4 text-left text-white">
            <Zap className="h-5 w-5" />
            <div className="mt-6">
              <p className="text-base font-semibold">Khám ngay</p>
              <p className="text-xs text-teal-100">Hệ thống tìm bác sĩ gần bạn trong vài giây</p>
            </div>
          </button>
          <button onClick={() => nav('/p/ai')} className="col-span-2 flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left">
            <Sparkles className="h-5 w-5 text-teal-700" />
            <div className="mt-6">
              <p className="text-sm font-semibold text-slate-900">Gợi ý chuyên khoa</p>
              <p className="text-xs text-slate-500">Từ mô tả triệu chứng</p>
            </div>
          </button>
        </div>

        <SectionTitle>Chuyên khoa</SectionTitle>
        {specs.isLoading ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {(specs.data || []).map((s) => (
              <button key={s.id} onClick={() => nav(`/p/search?specialtyId=${s.id}`)} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white p-2.5 text-center ring-1 ring-slate-200 hover:ring-teal-300">
                <SpecialtyIcon icon={s.icon} className="h-5 w-5 text-teal-700" />
                <span className="text-[11px] font-medium leading-tight text-slate-700">{s.name}</span>
                <span className="text-[10px] text-slate-400">{s.onlineCount} online</span>
              </button>
            ))}
          </div>
        )}

        <SectionTitle action={<button onClick={() => nav('/p/search')} className="text-xs font-semibold text-teal-700">Xem bản đồ</button>}>
          Bác sĩ gần bạn đang sẵn sàng
        </SectionTitle>
        {nearby.isLoading ? (
          <Spinner />
        ) : !nearby.data?.items.length ? (
          <Empty title="Chưa có bác sĩ sẵn sàng trong 5 km" hint="Thử mở bản đồ với bán kính 10 km hoặc đặt lịch hẹn." />
        ) : (
          <div className="space-y-2 pb-4">
            {nearby.data.items.map((d) => (
              <DoctorCard
                key={d.id}
                d={d}
                onClick={() => nav(`/p/doctors/${d.id}`)}
                action={
                  <Btn
                    variant="secondary"
                    className="w-full py-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      nav(`/p/doctors/${d.id}?book=1`)
                    }}
                  >
                    Đặt khám
                  </Btn>
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
