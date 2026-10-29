import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, X, RotateCcw } from 'lucide-react'
import { get, patch, errorMessage } from '@/lib/http'
import { CTYPE, dateTime, vnd } from '@/lib/format'
import { AdminPage } from '@/components/layouts'
import { Avatar, Btn, Chip, Empty, ErrorBox, Field, RatingInline, Spinner, StatusBadge, inputCls } from '@/components/kit'
import { Modal, Pagination, SearchBox, TableWrap, Tabs, qs, td, th, useDebounced, type Paged } from './shared'

type Verification = 'PENDING' | 'APPROVED' | 'REJECTED'
interface AdminDoctor {
  id: number
  fullName: string
  avatar: string | null
  email: string
  phone: string | null
  licenseNumber: string | null
  specialty: { name: string } | null
  specialties: { id: number; name: string }[]
  clinic: { name: string; address?: string } | null
  experienceYears: number
  education: string | null
  consultationFee: number
  consultationTypes: string[]
  rating: number
  totalReviews: number
  status: string
  verificationStatus: Verification
  verificationNote: string | null
  isActive: boolean
  isSimulated: boolean
  createdAt: string
}
type Resp = Paged<AdminDoctor> & { counts: Record<Verification, number> }

const VLABEL: Record<Verification, string> = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối' }

export default function DoctorsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Verification>('PENDING')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState<{ doctor: AdminDoctor; to: Verification } | null>(null)
  const [note, setNote] = useState('')
  const q = useDebounced(search.trim())

  const params = { verification: tab, status, q, page }
  const list = useQuery({
    queryKey: ['admin', 'doctors', params],
    queryFn: () => get<Resp>(`admin/doctors${qs(params)}`),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const verify = useMutation({
    mutationFn: (v: { id: number; status: Verification; note?: string }) => patch(`admin/doctors/${v.id}/verify`, { status: v.status, note: v.note || undefined }),
    onSuccess: (_r, v) => {
      toast.success(v.status === 'APPROVED' ? 'Đã duyệt hồ sơ bác sĩ' : v.status === 'REJECTED' ? 'Đã từ chối hồ sơ' : 'Đã chuyển hồ sơ về chờ duyệt')
      setDialog(null)
      qc.invalidateQueries({ queryKey: ['admin', 'doctors'] })
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const open = (doctor: AdminDoctor, to: Verification) => {
    setNote(to === 'REJECTED' ? doctor.verificationNote || '' : '')
    setDialog({ doctor, to })
  }
  const counts = list.data?.counts
  const items = list.data?.items || []

  return (
    <AdminPage title="Bác sĩ và duyệt hồ sơ" subtitle="Kiểm tra chứng chỉ hành nghề trước khi bác sĩ được nhận yêu cầu khám">
      <Tabs
        value={tab}
        onChange={(v) => {
          setTab(v)
          setPage(1)
        }}
        tabs={(['PENDING', 'APPROVED', 'REJECTED'] as Verification[]).map((v) => ({ value: v, label: VLABEL[v], count: counts?.[v] }))}
      />
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
          {[
            ['', 'Mọi trạng thái'],
            ['ONLINE', 'Online'],
            ['BUSY', 'Đang khám'],
            ['OFFLINE', 'Offline'],
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
      </div>

      {list.isLoading && <Spinner />}
      {list.error && <ErrorBox message={errorMessage(list.error)} onRetry={() => list.refetch()} />}
      {list.data && !items.length && <Empty title={`Không có bác sĩ ở mục “${VLABEL[tab]}”`} hint={q || status ? 'Thử bỏ bộ lọc hoặc từ khóa tìm kiếm.' : undefined} />}
      {items.length > 0 && (
        <TableWrap className={list.isFetching ? 'opacity-70' : ''}>
          <thead>
            <tr>
              <th className={th}>Bác sĩ</th>
              <th className={th}>Số CCHN</th>
              <th className={th}>Chuyên khoa</th>
              <th className={th}>Phòng khám</th>
              <th className={`${th} text-right`}>Kinh nghiệm</th>
              <th className={`${th} text-right`}>Phí khám</th>
              <th className={th}>Hình thức</th>
              <th className={th}>Trạng thái</th>
              <th className={th}>Đánh giá</th>
              <th className={th}>Đăng ký</th>
              <th className={`${th} text-right`}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50/60">
                <td className={td}>
                  <div className="flex items-center gap-2.5">
                    <Avatar src={d.avatar} doctor size={32} />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">
                        BS. {d.fullName}
                        {!d.isActive && <span className="ml-1.5 text-xs font-normal text-rose-700">(đã khóa)</span>}
                      </p>
                      <p className="text-xs text-slate-500">{d.email}</p>
                    </div>
                  </div>
                </td>
                <td className={`${td} font-mono text-xs`}>{d.licenseNumber || <span className="text-rose-700">Chưa khai báo</span>}</td>
                <td className={td}>{d.specialties.length ? d.specialties.map((s) => s.name).join(', ') : d.specialty?.name || '—'}</td>
                <td className={`${td} max-w-[220px] truncate`} title={d.clinic?.address}>
                  {d.clinic?.name || '—'}
                </td>
                <td className={`${td} text-right tabular-nums`}>{d.experienceYears} năm</td>
                <td className={`${td} text-right tabular-nums`}>{vnd(d.consultationFee)}</td>
                <td className={`${td} text-xs`}>{d.consultationTypes.map((c) => CTYPE[c] || c).join(', ')}</td>
                <td className={td}>
                  <StatusBadge status={d.status} />
                </td>
                <td className={td}>
                  <RatingInline rating={d.rating} total={d.totalReviews} />
                </td>
                <td className={`${td} text-xs text-slate-500`}>{dateTime(d.createdAt)}</td>
                <td className={`${td} text-right`}>
                  <div className="flex justify-end gap-1.5">
                    {d.verificationStatus !== 'APPROVED' && (
                      <Btn className="px-2.5 py-1.5 text-xs" onClick={() => open(d, 'APPROVED')}>
                        <Check className="h-3.5 w-3.5" /> Duyệt
                      </Btn>
                    )}
                    {d.verificationStatus !== 'REJECTED' && (
                      <Btn variant="outline" className="px-2.5 py-1.5 text-xs text-rose-700" onClick={() => open(d, 'REJECTED')}>
                        <X className="h-3.5 w-3.5" /> {d.verificationStatus === 'APPROVED' ? 'Thu hồi' : 'Từ chối'}
                      </Btn>
                    )}
                    {d.verificationStatus === 'REJECTED' && (
                      <Btn variant="ghost" className="px-2.5 py-1.5 text-xs" onClick={() => open(d, 'PENDING')} title="Chuyển về chờ duyệt">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Btn>
                    )}
                  </div>
                  {d.verificationNote && d.verificationStatus === 'REJECTED' && <p className="mt-1 max-w-[220px] truncate text-right text-xs text-slate-500" title={d.verificationNote}>Lý do: {d.verificationNote}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      {list.data && <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={setPage} unit="bác sĩ" />}

      <Modal
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={dialog?.to === 'APPROVED' ? 'Duyệt hồ sơ bác sĩ' : dialog?.to === 'REJECTED' ? (dialog.doctor.verificationStatus === 'APPROVED' ? 'Thu hồi duyệt hồ sơ' : 'Từ chối hồ sơ') : 'Chuyển về chờ duyệt'}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setDialog(null)}>
              Hủy
            </Btn>
            <Btn
              variant={dialog?.to === 'REJECTED' ? 'danger' : 'primary'}
              loading={verify.isPending}
              disabled={dialog?.to === 'REJECTED' && note.trim().length < 3}
              onClick={() => dialog && verify.mutate({ id: dialog.doctor.id, status: dialog.to, note: note.trim() })}
            >
              {dialog?.to === 'APPROVED' ? 'Duyệt hồ sơ' : dialog?.to === 'REJECTED' ? 'Xác nhận từ chối' : 'Chuyển về chờ duyệt'}
            </Btn>
          </>
        }
      >
        {dialog && (
          <>
            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
              <dt className="text-slate-500">Bác sĩ</dt>
              <dd className="font-medium text-slate-900">BS. {dialog.doctor.fullName}</dd>
              <dt className="text-slate-500">Số CCHN</dt>
              <dd className="font-mono text-xs leading-5">{dialog.doctor.licenseNumber || '—'}</dd>
              <dt className="text-slate-500">Chuyên khoa</dt>
              <dd>{dialog.doctor.specialty?.name || '—'}</dd>
              <dt className="text-slate-500">Phòng khám</dt>
              <dd>{dialog.doctor.clinic?.name || '—'}</dd>
              <dt className="text-slate-500">Học vấn</dt>
              <dd>{dialog.doctor.education || '—'}</dd>
              <dt className="text-slate-500">Kinh nghiệm</dt>
              <dd>{dialog.doctor.experienceYears} năm</dd>
            </dl>
            {dialog.to === 'APPROVED' && <p className="text-sm text-slate-600">Sau khi duyệt, bác sĩ có thể bật trạng thái sẵn sàng và xuất hiện trong kết quả ghép cặp.</p>}
            {dialog.to === 'REJECTED' && dialog.doctor.verificationStatus === 'APPROVED' && <p className="text-sm text-slate-600">Bác sĩ sẽ bị chuyển sang offline và không nhận được yêu cầu mới.</p>}
            <Field label={dialog.to === 'REJECTED' ? 'Lý do (gửi cho bác sĩ)' : 'Ghi chú (không bắt buộc)'} hint={dialog.to === 'REJECTED' ? 'Tối thiểu 3 ký tự, tối đa 300 ký tự.' : undefined}>
              <textarea value={note} maxLength={300} rows={3} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder={dialog.to === 'REJECTED' ? 'Ví dụ: Số CCHN không khớp với hồ sơ Sở Y tế' : ''} />
            </Field>
          </>
        )}
      </Modal>
    </AdminPage>
  )
}
