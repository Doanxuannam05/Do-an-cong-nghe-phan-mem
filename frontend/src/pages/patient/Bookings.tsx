import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Video, Building2 } from 'lucide-react'
import { get } from '@/lib/http'
import type { Paged } from '@/lib/hooks'
import { BTYPE, dateTime, vnd } from '@/lib/format'
import { Btn, Chip, Empty, ErrorBox, PageHeader, Spinner, StatusBadge } from '@/components/kit'

export interface BookingRow {
  id: number
  code: string
  type: string
  consultation_type: string
  status: string
  scheduled_at: string | null
  created_at: string
  fee: number | null
  specialty_name: string
  payment_status: string | null
  reviewed: boolean
  patient_name?: string
  doctor: { id: number; fullName: string; specialty?: { name: string } } | null
}

const TABS = [
  { v: 'active', l: 'Đang diễn ra' },
  { v: 'upcoming', l: 'Sắp tới' },
  { v: 'history', l: 'Lịch sử' },
]

export default function PatientBookings() {
  const nav = useNavigate()
  const [scope, setScope] = useState('active')
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['bookings', scope, page], queryFn: () => get<Paged<BookingRow>>(`bookings?scope=${scope}&page=${page}&limit=15`), staleTime: 20_000 })

  return (
    <div>
      <PageHeader title="Lịch khám của tôi" />
      <div className="flex gap-2 px-4 pt-3">
        {TABS.map((t) => (
          <Chip key={t.v} active={scope === t.v} onClick={() => { setScope(t.v); setPage(1) }}>
            {t.l}
          </Chip>
        ))}
      </div>
      <div className="space-y-2 p-4">
        {q.isLoading ? (
          <Spinner />
        ) : q.isError ? (
          <ErrorBox message="Không tải được lịch khám." onRetry={() => q.refetch()} />
        ) : !q.data?.items.length ? (
          <Empty title={scope === 'history' ? 'Chưa có lịch sử khám' : 'Không có lịch khám nào'} action={<Btn variant="secondary" onClick={() => nav('/p/request')}>Khám ngay</Btn>} />
        ) : (
          q.data.items.map((b) => (
            <button key={b.id} onClick={() => nav(`/p/bookings/${b.id}`)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left hover:border-teal-300">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                {b.consultation_type === 'ONLINE' ? <Video className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={b.status} />
                  {b.status === 'COMPLETED' && b.payment_status === 'PENDING' && <span className="text-xs font-medium text-amber-700">Chờ thanh toán</span>}
                  {b.status === 'COMPLETED' && !b.reviewed && b.payment_status !== 'PENDING' && <span className="text-xs font-medium text-teal-700">Chưa đánh giá</span>}
                </div>
                <p className="mt-1 truncate text-sm font-medium text-slate-900">
                  {b.doctor ? `BS. ${b.doctor.fullName}` : 'Đang tìm bác sĩ'} · {b.specialty_name}
                </p>
                <p className="text-xs text-slate-500">
                  {BTYPE[b.type]} · {b.code} · {dateTime(b.scheduled_at || b.created_at)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-800">{vnd(b.fee)}</p>
                <ChevronRight className="ml-auto mt-1 h-4 w-4 text-slate-400" />
              </div>
            </button>
          ))
        )}
        {q.data && q.data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2 text-sm">
            <Btn variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</Btn>
            <span className="text-slate-500">{page}/{q.data.totalPages}</span>
            <Btn variant="outline" disabled={page >= q.data.totalPages} onClick={() => setPage(page + 1)}>Sau</Btn>
          </div>
        )}
      </div>
    </div>
  )
}
