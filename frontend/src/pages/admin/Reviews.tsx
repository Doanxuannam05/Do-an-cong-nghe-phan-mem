import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'
import { get, patch, errorMessage } from '@/lib/http'
import { dateTime } from '@/lib/format'
import { AdminPage } from '@/components/layouts'
import { Btn, Chip, Empty, ErrorBox, Spinner, Stars, StatusBadge } from '@/components/kit'
import { Pagination, TableWrap, qs, selectCls, td, th, type Paged } from './shared'

interface Review {
  id: number
  booking_id: number
  code: string
  doctor_id: number
  patient_id: number
  rating: number
  comment: string | null
  status: 'VISIBLE' | 'HIDDEN'
  created_at: string
  patient_name: string
  doctor_name: string
}

export default function ReviewsPage() {
  const qc = useQueryClient()
  const [status, setStatus] = useState('')
  const [maxRating, setMaxRating] = useState('')
  const [page, setPage] = useState(1)
  const params = { status, maxRating, page }

  const list = useQuery({
    queryKey: ['admin', 'reviews', params],
    queryFn: () => get<Paged<Review>>(`admin/reviews${qs(params)}`),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const toggle = useMutation({
    mutationFn: (r: Review) => patch<{ id: number; status: string; doctorRating: number }>(`admin/reviews/${r.id}`, { status: r.status === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE' }),
    onSuccess: (res, r) => {
      toast.success(`${res.status === 'HIDDEN' ? 'Đã ẩn' : 'Đã hiển thị lại'} đánh giá. Điểm mới của BS. ${r.doctor_name}: ${res.doctorRating ? res.doctorRating.toFixed(2) : 'chưa có'}`)
      qc.invalidateQueries({ queryKey: ['admin', 'reviews'] })
      qc.invalidateQueries({ queryKey: ['admin', 'doctors'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const items = list.data?.items || []

  return (
    <AdminPage title="Đánh giá" subtitle="Ẩn đánh giá vi phạm. Điểm trung bình của bác sĩ được tính lại ngay sau khi ẩn hoặc hiện.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {[
            ['', 'Tất cả'],
            ['VISIBLE', 'Đang hiển thị'],
            ['HIDDEN', 'Đã ẩn'],
          ].map(([v, l]) => (
            <Chip
              key={v}
              active={status === v}
              onClick={() => {
                setStatus(v)
                setPage(1)
              }}
            >
              {l}
            </Chip>
          ))}
        </div>
        <select
          aria-label="Số sao"
          value={maxRating}
          onChange={(e) => {
            setMaxRating(e.target.value)
            setPage(1)
          }}
          className={selectCls}
        >
          <option value="">Mọi số sao</option>
          <option value="1">1 sao</option>
          <option value="2">Từ 2 sao trở xuống</option>
          <option value="3">Từ 3 sao trở xuống</option>
          <option value="4">Từ 4 sao trở xuống</option>
        </select>
      </div>

      {list.isLoading && <Spinner />}
      {list.error && <ErrorBox message={errorMessage(list.error)} onRetry={() => list.refetch()} />}
      {list.data && !items.length && <Empty title="Không có đánh giá phù hợp" />}
      {items.length > 0 && (
        <TableWrap className={list.isFetching ? 'opacity-70' : ''}>
          <thead>
            <tr>
              <th className={th}>Số sao</th>
              <th className={th}>Nội dung</th>
              <th className={th}>Bệnh nhân</th>
              <th className={th}>Bác sĩ</th>
              <th className={th}>Mã lịch</th>
              <th className={th}>Thời gian</th>
              <th className={th}>Trạng thái</th>
              <th className={`${th} text-right`}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className={r.status === 'HIDDEN' ? 'bg-slate-50/70 text-slate-500' : 'hover:bg-slate-50/60'}>
                <td className={td}>
                  <Stars value={r.rating} size={13} />
                </td>
                <td className={`${td} min-w-[240px] max-w-[420px] whitespace-normal`}>{r.comment || <span className="text-slate-400">Không có nội dung</span>}</td>
                <td className={td}>{r.patient_name}</td>
                <td className={td}>BS. {r.doctor_name}</td>
                <td className={`${td} font-mono text-xs`}>{r.code}</td>
                <td className={`${td} text-xs text-slate-500`}>{dateTime(r.created_at)}</td>
                <td className={td}>
                  <StatusBadge status={r.status} />
                </td>
                <td className={`${td} text-right`}>
                  <Btn
                    variant={r.status === 'VISIBLE' ? 'outline' : 'secondary'}
                    className="px-2.5 py-1.5 text-xs"
                    loading={toggle.isPending && toggle.variables?.id === r.id}
                    onClick={() => toggle.mutate(r)}
                  >
                    {r.status === 'VISIBLE' ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {r.status === 'VISIBLE' ? 'Ẩn' : 'Hiện lại'}
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      {list.data && <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={setPage} unit="đánh giá" />}
    </AdminPage>
  )
}
