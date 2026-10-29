import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Lock, LockOpen } from 'lucide-react'
import { get, patch, errorMessage } from '@/lib/http'
import { dateTime, relative } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import { AdminPage } from '@/components/layouts'
import { Btn, Chip, Empty, ErrorBox, Spinner, StatusBadge } from '@/components/kit'
import { Modal, Pagination, SearchBox, TableWrap, qs, td, th, useDebounced, type Paged } from './shared'

interface AdminUser {
  id: number
  email: string
  phone: string | null
  full_name: string
  role: 'PATIENT' | 'DOCTOR' | 'ADMIN'
  is_active: boolean
  created_at: string
  last_login_at: string | null
  patient_id: number | null
  doctor_id: number | null
  bookings: number
}

const ROLE: Record<string, string> = { PATIENT: 'Bệnh nhân', DOCTOR: 'Bác sĩ', ADMIN: 'Quản trị viên' }

export default function UsersPage() {
  const qc = useQueryClient()
  const { user: me } = useAuth()
  const [role, setRole] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [confirm, setConfirm] = useState<AdminUser | null>(null)
  const q = useDebounced(search.trim())
  const params = { role, q, page }

  const list = useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => get<Paged<AdminUser>>(`admin/users${qs(params)}`),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const toggle = useMutation({
    mutationFn: (u: AdminUser) => patch(`admin/users/${u.id}`, { isActive: !u.is_active }),
    onSuccess: (_r, u) => {
      toast.success(u.is_active ? `Đã khóa tài khoản ${u.full_name}` : `Đã mở khóa tài khoản ${u.full_name}`)
      setConfirm(null)
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      if (u.doctor_id) qc.invalidateQueries({ queryKey: ['admin', 'doctors'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const items = list.data?.items || []

  return (
    <AdminPage title="Người dùng" subtitle="Tài khoản bệnh nhân, bác sĩ và quản trị viên">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v)
            setPage(1)
          }}
          placeholder="Tìm theo tên hoặc email"
        />
        <div className="flex gap-1.5 overflow-x-auto">
          {[['', 'Tất cả'], ...Object.entries(ROLE)].map(([v, l]) => (
            <Chip
              key={v}
              active={role === v}
              onClick={() => {
                setRole(v)
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
      {list.data && !items.length && <Empty title="Không tìm thấy người dùng" hint={q ? 'Thử từ khóa khác.' : undefined} />}
      {items.length > 0 && (
        <TableWrap className={list.isFetching ? 'opacity-70' : ''}>
          <thead>
            <tr>
              <th className={th}>Họ tên</th>
              <th className={th}>Email</th>
              <th className={th}>Số điện thoại</th>
              <th className={th}>Vai trò</th>
              <th className={`${th} text-right`}>Lượt khám</th>
              <th className={th}>Ngày tạo</th>
              <th className={th}>Đăng nhập gần nhất</th>
              <th className={th}>Trạng thái</th>
              <th className={`${th} text-right`}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/60">
                <td className={`${td} font-medium text-slate-900`}>{u.full_name}</td>
                <td className={td}>{u.email}</td>
                <td className={`${td} tabular-nums`}>{u.phone || '—'}</td>
                <td className={td}>{ROLE[u.role] || u.role}</td>
                <td className={`${td} text-right tabular-nums`}>{u.role === 'ADMIN' ? '—' : u.bookings}</td>
                <td className={`${td} text-xs text-slate-500`}>{dateTime(u.created_at)}</td>
                <td className={`${td} text-xs text-slate-500`}>{u.last_login_at ? relative(u.last_login_at) : 'Chưa đăng nhập'}</td>
                <td className={td}>{u.is_active ? <StatusBadge status="SUCCESS" label="Hoạt động" /> : <StatusBadge status="FAILED" label="Đã khóa" />}</td>
                <td className={`${td} text-right`}>
                  {u.id === me?.id ? (
                    <span className="text-xs text-slate-400">Tài khoản của bạn</span>
                  ) : u.is_active ? (
                    <Btn variant="outline" className="px-2.5 py-1.5 text-xs text-rose-700" onClick={() => setConfirm(u)}>
                      <Lock className="h-3.5 w-3.5" /> Khóa
                    </Btn>
                  ) : (
                    <Btn variant="secondary" className="px-2.5 py-1.5 text-xs" loading={toggle.isPending && toggle.variables?.id === u.id} onClick={() => toggle.mutate(u)}>
                      <LockOpen className="h-3.5 w-3.5" /> Mở khóa
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      {list.data && <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={setPage} unit="người dùng" />}

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Khóa tài khoản"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setConfirm(null)}>
              Hủy
            </Btn>
            <Btn variant="danger" loading={toggle.isPending} onClick={() => confirm && toggle.mutate(confirm)}>
              Khóa tài khoản
            </Btn>
          </>
        }
      >
        {confirm && (
          <p className="text-sm text-slate-700">
            Khóa tài khoản <b>{confirm.full_name}</b> ({confirm.email})? Người dùng sẽ bị đăng xuất khỏi mọi thiết bị và không đăng nhập lại được cho đến khi được mở khóa.
            {confirm.role === 'DOCTOR' && ' Bác sĩ cũng sẽ không nhận được yêu cầu khám mới.'}
          </p>
        )}
      </Modal>
    </AdminPage>
  )
}
