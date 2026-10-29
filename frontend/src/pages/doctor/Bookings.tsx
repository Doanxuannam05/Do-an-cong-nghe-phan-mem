import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { get } from '@/lib/http'
import { BTYPE, CTYPE, dateTime, vnd } from '@/lib/format'
import { Btn, Chip, Empty, ErrorBox, PageHeader, Spinner, StatusBadge } from '@/components/kit'
import { LOAD_ERROR } from './common'

interface BookingRow {
  id: number
  code: string
  type: 'SCHEDULED' | 'ON_DEMAND'
  consultation_type: string
  status: string
  scheduled_at: string | null
  created_at: string
  fee: number | null
  specialty_name: string | null
  patient_name: string | null
  payment_status: string | null
  symptoms?: string | null
}
interface Paged<T> {
  items: T[]
  page: number
  limit: number
  total: number
  totalPages: number
}

const TABS = [
  { key: 'active', label: 'Đang xử lý' },
  { key: 'upcoming', label: 'Sắp tới' },
  { key: 'history', label: 'Lịch sử' },
  { key: 'all', label: 'Tất cả' },
] as const
type Scope = (typeof TABS)[number]['key']

export default function BookingsPage() {
  const [scope, setScope] = useState<Scope>('active')
  const [page, setPage] = useState(1)
  const q = useQuery({
    queryKey: ['bookings', scope, page],
    queryFn: () => get<Paged<BookingRow>>(`bookings?scope=${scope}&page=${page}`),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
  const data = q.data

  return (
    <div>
      <PageHeader title="Lịch khám của tôi" back subtitle={data ? `${data.total} lịch khám` : undefined} />
      <div className="flex gap-2 overflow-x-auto px-4 pt-3">
        {TABS.map((t) => (
          <Chip
            key={t.key}
            active={scope === t.key}
            onClick={() => {
              setScope(t.key)
              setPage(1)
            }}
          >
            {t.label}
          </Chip>
        ))}
      </div>
      <div className="px-4 py-3">
        {q.isLoading ? (
          <Spinner />
        ) : q.isError ? (
          <ErrorBox message={LOAD_ERROR} onRetry={() => q.refetch()} />
        ) : !data?.items.length ? (
          <Empty title="Không có lịch khám" hint={scope === 'active' ? 'Ca khám đang chờ hoặc đang diễn ra sẽ hiện ở đây.' : undefined} />
        ) : (
          <>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {data.items.map((b) => (
                <Link key={b.id} to={`/d/bookings/${b.id}`} className="block px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{b.patient_name || 'Người bệnh'}</p>
                      <p className="truncate text-xs text-slate-500">
                        {b.code} · {BTYPE[b.type] || b.type} · {CTYPE[b.consultation_type] || b.consultation_type}
                      </p>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-slate-600">
                      {dateTime(b.scheduled_at || b.created_at)}
                      {b.specialty_name && ` · ${b.specialty_name}`}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="font-semibold tabular-nums text-slate-900">{vnd(b.fee)}</span>
                      {b.payment_status && <span className="ml-1.5 text-xs text-slate-500">{b.payment_status === 'SUCCESS' ? 'Đã thanh toán' : b.payment_status === 'PENDING' ? 'Chờ thanh toán' : b.payment_status === 'REFUNDED' ? 'Đã hoàn tiền' : 'Lỗi thanh toán'}</span>}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            {data.totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between">
                <Btn variant="outline" className="px-3 py-2" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Trước
                </Btn>
                <span className="text-sm tabular-nums text-slate-600">
                  Trang {data.page}/{data.totalPages}
                </span>
                <Btn variant="outline" className="px-3 py-2" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Sau <ChevronRight className="h-4 w-4" />
                </Btn>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
