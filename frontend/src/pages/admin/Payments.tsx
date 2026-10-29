import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { get, patch, errorMessage } from '@/lib/http'
import { PAY_METHOD, STATUS, dateTime, vnd } from '@/lib/format'
import { AdminPage } from '@/components/layouts'
import { Btn, Chip, Empty, ErrorBox, Spinner, Stat, StatusBadge } from '@/components/kit'
import { Modal, Pagination, TableWrap, qs, selectCls, td, th, type Paged } from './shared'

interface Payment {
  id: number
  booking_id: number
  code: string
  amount: number
  method: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED'
  transaction_ref: string | null
  paid_at: string | null
  created_at: string
  patient_name: string
  doctor_name: string | null
}
type Resp = Paged<Payment> & { totalSuccess: number }
type Action = { p: Payment; to: 'SUCCESS' | 'REFUNDED' }

export default function PaymentsPage() {
  const qc = useQueryClient()
  const [status, setStatus] = useState('')
  const [method, setMethod] = useState('')
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<Action | null>(null)
  const params = { status, method, page }

  const list = useQuery({
    queryKey: ['admin', 'payments', params],
    queryFn: () => get<Resp>(`admin/payments${qs(params)}`),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const update = useMutation({
    mutationFn: (a: Action) => patch(`payments/${a.p.id}`, { status: a.to }),
    onSuccess: (_r, a) => {
      toast.success(a.to === 'SUCCESS' ? `Đã xác nhận thanh toán ${a.p.code}` : `Đã hoàn tiền ${a.p.code}`)
      setAction(null)
      qc.invalidateQueries({ queryKey: ['admin', 'payments'] })
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const items = list.data?.items || []
  const filterLabel = [status && STATUS[status]?.label, method && PAY_METHOD[method]].filter(Boolean).join(' · ')

  return (
    <AdminPage title="Thanh toán" subtitle="Giao dịch tiền mặt, chuyển khoản và ví giả lập">
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Số giao dịch" value={list.data ? list.data.total.toLocaleString('vi-VN') : '—'} hint={filterLabel || 'Tất cả giao dịch'} />
        <Stat label="Tổng tiền đã thu" value={list.data ? vnd(list.data.totalSuccess) : '—'} hint="Giao dịch thành công trong bộ lọc hiện tại" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto">
          {[
            ['', 'Tất cả'],
            ['PENDING', 'Chờ xử lý'],
            ['SUCCESS', 'Thành công'],
            ['FAILED', 'Thất bại'],
            ['REFUNDED', 'Đã hoàn tiền'],
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
          aria-label="Phương thức"
          value={method}
          onChange={(e) => {
            setMethod(e.target.value)
            setPage(1)
          }}
          className={selectCls}
        >
          <option value="">Mọi phương thức</option>
          {Object.entries(PAY_METHOD).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {list.isLoading && <Spinner />}
      {list.error && <ErrorBox message={errorMessage(list.error)} onRetry={() => list.refetch()} />}
      {list.data && !items.length && <Empty title="Không có giao dịch phù hợp" />}
      {items.length > 0 && (
        <TableWrap className={list.isFetching ? 'opacity-70' : ''}>
          <thead>
            <tr>
              <th className={th}>Mã lịch</th>
              <th className={th}>Bệnh nhân</th>
              <th className={th}>Bác sĩ</th>
              <th className={`${th} text-right`}>Số tiền</th>
              <th className={th}>Phương thức</th>
              <th className={th}>Mã giao dịch</th>
              <th className={th}>Trạng thái</th>
              <th className={th}>Tạo lúc</th>
              <th className={th}>Thanh toán lúc</th>
              <th className={`${th} text-right`}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/60">
                <td className={`${td} font-mono text-xs font-semibold text-slate-900`}>{p.code}</td>
                <td className={td}>{p.patient_name}</td>
                <td className={td}>{p.doctor_name || '—'}</td>
                <td className={`${td} text-right font-medium tabular-nums text-slate-900`}>{vnd(p.amount)}</td>
                <td className={td}>{PAY_METHOD[p.method] || p.method}</td>
                <td className={`${td} font-mono text-xs`}>{p.transaction_ref || '—'}</td>
                <td className={td}>
                  <StatusBadge status={p.status} />
                </td>
                <td className={`${td} text-xs text-slate-500`}>{dateTime(p.created_at)}</td>
                <td className={`${td} text-xs text-slate-500`}>{dateTime(p.paid_at)}</td>
                <td className={`${td} text-right`}>
                  {p.status === 'PENDING' && (
                    <Btn variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => setAction({ p, to: 'SUCCESS' })}>
                      Xác nhận đã thu
                    </Btn>
                  )}
                  {p.status === 'SUCCESS' && (
                    <Btn variant="outline" className="px-2.5 py-1.5 text-xs" onClick={() => setAction({ p, to: 'REFUNDED' })}>
                      Hoàn tiền
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      {list.data && <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={setPage} unit="giao dịch" />}

      <Modal
        open={!!action}
        onClose={() => setAction(null)}
        title={action?.to === 'SUCCESS' ? 'Xác nhận đã thu tiền' : 'Hoàn tiền giao dịch'}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setAction(null)}>
              Hủy
            </Btn>
            <Btn variant={action?.to === 'REFUNDED' ? 'danger' : 'primary'} loading={update.isPending} onClick={() => action && update.mutate(action)}>
              {action?.to === 'SUCCESS' ? 'Xác nhận' : 'Hoàn tiền'}
            </Btn>
          </>
        }
      >
        {action && (
          <p className="text-sm text-slate-700">
            {action.to === 'SUCCESS'
              ? `Ghi nhận đã thu ${vnd(action.p.amount)} (${PAY_METHOD[action.p.method] || action.p.method}) cho lịch ${action.p.code} của ${action.p.patient_name}?`
              : `Hoàn ${vnd(action.p.amount)} cho ${action.p.patient_name} (lịch ${action.p.code})? Giao dịch sẽ chuyển sang trạng thái “Đã hoàn tiền” và không tính vào doanh thu.`}
          </p>
        )}
      </Modal>
    </AdminPage>
  )
}
