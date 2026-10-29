import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { get, errorMessage } from '@/lib/http'
import { ALGO, BTYPE, CTYPE, STATUS, dateTime, km } from '@/lib/format'
import { AdminPage } from '@/components/layouts'
import { Chip, Empty, ErrorBox, Spinner, StatusBadge } from '@/components/kit'
import { Pagination, SearchBox, TableWrap, qs, selectCls, td, th, useDebounced, type Paged } from './shared'

interface AdminBooking {
  id: number
  code: string
  type: string
  consultation_type: string
  status: string
  created_at: string
  scheduled_at: string | null
  fee: number | null
  distance_km: number | null
  matching_ms: number | null
  algorithm: string | null
  specialty: string | null
  patient_name: string
  doctor_name: string | null
  offers: number
}

const STATUSES = ['SEARCHING', 'OFFERED', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'NO_DOCTOR_FOUND']

export default function BookingsPage() {
  const nav = useNavigate()
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const q = useDebounced(search.trim())
  const params = { status, type, q, page }

  const list = useQuery({
    queryKey: ['admin', 'bookings', params],
    queryFn: () => get<Paged<AdminBooking>>(`admin/bookings${qs(params)}`),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
  const items = list.data?.items || []

  return (
    <AdminPage title="Yêu cầu và lịch khám" subtitle="Tất cả yêu cầu khám ngay và lịch hẹn. Chọn một dòng để xem chi tiết và lịch sử điều phối.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v)
            setPage(1)
          }}
          placeholder="Mã yêu cầu hoặc tên bệnh nhân"
        />
        <select
          aria-label="Trạng thái"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          className={selectCls}
        >
          <option value="">Mọi trạng thái</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS[s]?.label || s}
            </option>
          ))}
        </select>
        <div className="flex gap-1.5">
          {[['', 'Tất cả'], ...Object.entries(BTYPE)].map(([v, l]) => (
            <Chip
              key={v}
              active={type === v}
              onClick={() => {
                setType(v)
                setPage(1)
              }}
            >
              {l}
            </Chip>
          ))}
        </div>
      </div>

      {list.isLoading && <Spinner />}
      {list.error && <ErrorBox message={errorMessage(list.error)} onRetry={() => list.refetch()} />}
      {list.data && !items.length && <Empty title="Không có yêu cầu phù hợp" hint="Thử bỏ bớt bộ lọc." />}
      {items.length > 0 && (
        <TableWrap className={list.isFetching ? 'opacity-70' : ''}>
          <thead>
            <tr>
              <th className={th}>Mã</th>
              <th className={th}>Loại</th>
              <th className={th}>Hình thức</th>
              <th className={th}>Chuyên khoa</th>
              <th className={th}>Bệnh nhân</th>
              <th className={th}>Bác sĩ</th>
              <th className={th}>Trạng thái</th>
              <th className={`${th} text-right`}>Lời mời</th>
              <th className={`${th} text-right`}>Ghép cặp</th>
              <th className={`${th} text-right`}>Khoảng cách</th>
              <th className={th}>Tạo lúc</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id} onClick={() => nav(`/a/bookings/${b.id}`)} className="cursor-pointer hover:bg-teal-50/40">
                <td className={`${td} font-mono text-xs font-semibold text-slate-900`}>{b.code}</td>
                <td className={td}>{BTYPE[b.type] || b.type}</td>
                <td className={td}>{CTYPE[b.consultation_type] || b.consultation_type}</td>
                <td className={td}>{b.specialty || '—'}</td>
                <td className={td}>{b.patient_name}</td>
                <td className={td}>{b.doctor_name || <span className="text-slate-400">Chưa có</span>}</td>
                <td className={td}>
                  <StatusBadge status={b.status} />
                </td>
                <td className={`${td} text-right tabular-nums`}>{b.offers}</td>
                <td className={`${td} text-right tabular-nums`} title={b.algorithm ? ALGO[b.algorithm] || b.algorithm : undefined}>
                  {b.matching_ms != null ? `${b.matching_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className={`${td} text-right tabular-nums`}>{km(b.distance_km)}</td>
                <td className={`${td} text-xs text-slate-500`}>
                  {dateTime(b.created_at)}
                  {b.type === 'SCHEDULED' && b.scheduled_at && <span className="block text-slate-400">Hẹn: {dateTime(b.scheduled_at)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      {list.data && <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={setPage} unit="yêu cầu" />}
    </AdminPage>
  )
}
