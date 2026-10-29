import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { get, patch, errorMessage } from '@/lib/http'
import { STATUS, dateTime, relative } from '@/lib/format'
import { AdminPage } from '@/components/layouts'
import { Btn, Card, Empty, ErrorBox, Field, Spinner, StatusBadge, inputCls } from '@/components/kit'
import { Modal, Tabs } from './shared'

type CStatus = 'OPEN' | 'PROCESSING' | 'RESOLVED' | 'REJECTED'
interface Complaint {
  id: number
  title: string
  description: string | null
  status: CStatus
  target_type: string | null
  admin_note: string | null
  booking_id: number | null
  booking_code: string | null
  doctor_id: number | null
  doctor_name: string | null
  reporter_id: number
  reporter_name: string
  reporter_role: string
  created_at: string
  updated_at: string
}

const STATUSES: CStatus[] = ['OPEN', 'PROCESSING', 'RESOLVED', 'REJECTED']
const C_LABEL: Record<CStatus, string> = { OPEN: 'Mới', PROCESSING: 'Đang xử lý', RESOLVED: 'Đã giải quyết', REJECTED: 'Từ chối' }
const TARGET: Record<string, string> = { DOCTOR: 'Bác sĩ', PAYMENT: 'Thanh toán', BOOKING: 'Lịch khám', SERVICE: 'Dịch vụ' }
const ROLE: Record<string, string> = { PATIENT: 'Bệnh nhân', DOCTOR: 'Bác sĩ', ADMIN: 'Quản trị viên' }

export default function ComplaintsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<CStatus | ''>('')
  const [editing, setEditing] = useState<Complaint | null>(null)
  const [form, setForm] = useState<{ status: CStatus; note: string }>({ status: 'PROCESSING', note: '' })

  const list = useQuery({
    queryKey: ['admin', 'complaints', tab],
    queryFn: () => get<Complaint[]>(`admin/complaints${tab ? `?status=${tab}` : ''}`),
    staleTime: 30_000,
  })

  const update = useMutation({
    mutationFn: (v: { id: number; status: CStatus; adminNote?: string }) => patch<Complaint>(`admin/complaints/${v.id}`, { status: v.status, adminNote: v.adminNote }),
    onSuccess: (_r, v) => {
      toast.success(`Đã cập nhật khiếu nại: ${C_LABEL[v.status]}. Người gửi đã được thông báo.`)
      setEditing(null)
      qc.invalidateQueries({ queryKey: ['admin', 'complaints'] })
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const open = (c: Complaint) => {
    setForm({ status: c.status === 'OPEN' ? 'PROCESSING' : c.status, note: c.admin_note || '' })
    setEditing(c)
  }

  const items = list.data || []

  return (
    <AdminPage title="Khiếu nại" subtitle="Tiếp nhận và phản hồi khiếu nại của bệnh nhân và bác sĩ">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: '' as const, label: 'Tất cả' }, ...STATUSES.map((s) => ({ value: s, label: C_LABEL[s] }))]} />

      {list.isLoading && <Spinner />}
      {list.error && <ErrorBox message={errorMessage(list.error)} onRetry={() => list.refetch()} />}
      {list.data && !items.length && <Empty title="Không có khiếu nại" hint={tab ? `Không có khiếu nại ở trạng thái “${C_LABEL[tab]}”.` : undefined} />}
      <div className="space-y-3">
        {items.map((c) => (
          <Card key={c.id} className="flex flex-col gap-3 md:flex-row md:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={c.status} label={C_LABEL[c.status]} />
                {c.target_type && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{TARGET[c.target_type] || c.target_type}</span>}
                <span className="text-xs text-slate-400">#{c.id} · {relative(c.created_at)}</span>
              </div>
              <h3 className="mt-1.5 font-semibold text-slate-900">{c.title}</h3>
              {c.description && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{c.description}</p>}
              <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                <div>
                  Người gửi: <span className="text-slate-700">{c.reporter_name}</span> ({ROLE[c.reporter_role] || c.reporter_role})
                </div>
                {c.doctor_name && (
                  <div>
                    Bác sĩ liên quan: <span className="text-slate-700">BS. {c.doctor_name}</span>
                  </div>
                )}
                {c.booking_code && (
                  <div>
                    Lịch khám:{' '}
                    <a href={`#/a/bookings/${c.booking_id}`} className="font-mono text-teal-700 hover:underline">
                      {c.booking_code}
                    </a>
                  </div>
                )}
                <div>Gửi lúc: {dateTime(c.created_at)}</div>
              </dl>
              {c.admin_note && (
                <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <span className="text-xs font-medium text-slate-500">Phản hồi của quản trị viên · {dateTime(c.updated_at)}</span>
                  <p className="whitespace-pre-line">{c.admin_note}</p>
                </div>
              )}
            </div>
            <Btn variant={c.status === 'OPEN' || c.status === 'PROCESSING' ? 'primary' : 'outline'} className="shrink-0 py-2" onClick={() => open(c)}>
              {c.status === 'OPEN' ? 'Xử lý' : 'Cập nhật'}
            </Btn>
          </Card>
        ))}
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Xử lý khiếu nại #${editing.id}` : ''}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setEditing(null)}>
              Hủy
            </Btn>
            <Btn
              loading={update.isPending}
              disabled={(form.status === 'RESOLVED' || form.status === 'REJECTED') && form.note.trim().length < 3}
              onClick={() => editing && update.mutate({ id: editing.id, status: form.status, adminNote: form.note.trim() || undefined })}
            >
              Lưu và thông báo
            </Btn>
          </>
        }
      >
        {editing && (
          <>
            <p className="text-sm font-medium text-slate-900">{editing.title}</p>
            <Field label="Trạng thái">
              <div className="grid grid-cols-2 gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, status: s }))}
                    className={`rounded-xl border px-3 py-2 text-left text-sm ${form.status === s ? 'border-teal-700 bg-teal-50 font-semibold text-teal-800' : 'border-slate-200 text-slate-700 hover:border-teal-300'}`}
                  >
                    {C_LABEL[s]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Phản hồi gửi người khiếu nại" hint={form.status === 'RESOLVED' || form.status === 'REJECTED' ? 'Bắt buộc khi đóng khiếu nại. Tối đa 1000 ký tự.' : 'Không bắt buộc. Tối đa 1000 ký tự.'}>
              <textarea rows={4} maxLength={1000} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className={inputCls} placeholder="Ví dụ: Đã liên hệ bác sĩ và hoàn lại phí khám cho bạn." />
            </Field>
            {STATUS[form.status] && form.status !== editing.status && (
              <p className="text-xs text-slate-500">
                Trạng thái sẽ đổi từ “{C_LABEL[editing.status]}” sang “{C_LABEL[form.status]}”.
              </p>
            )}
          </>
        )}
      </Modal>
    </AdminPage>
  )
}
