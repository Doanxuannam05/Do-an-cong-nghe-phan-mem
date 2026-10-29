import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { get, patch, post, del, errorMessage } from '@/lib/http'
import { DANANG } from '@/lib/location'
import { AdminPage } from '@/components/layouts'
import { Btn, Card, Empty, ErrorBox, Field, Spinner, SpecialtyIcon, StatusBadge, inputCls } from '@/components/kit'
import MapView, { type MapMarker } from '@/components/MapView'
import { cn } from '@/lib/utils'
import { Modal, TableWrap, Tabs, selectCls, td, th } from './shared'

interface Specialty {
  id: number
  name: string
  slug: string
  description: string | null
  icon: string | null
  related: string[]
  status: 'ACTIVE' | 'INACTIVE'
  doctorCount: number
  onlineCount: number
}
interface Clinic {
  id: number
  name: string
  address: string | null
  district: string | null
  phone: string | null
  latitude: number
  longitude: number
  status: 'ACTIVE' | 'INACTIVE'
  doctor_count: number
}

const ICONS = ['stethoscope', 'heart-pulse', 'ear', 'scan-face', 'baby', 'bandage', 'flower-2', 'smile', 'eye', 'brain']

/** "Tai Mũi Họng" → "tai-mui-hong" */
const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

export default function CatalogPage() {
  const [tab, setTab] = useState<'specialties' | 'clinics'>('specialties')
  return (
    <AdminPage title="Chuyên khoa và phòng khám" subtitle="Danh mục dùng cho tìm kiếm, gợi ý chuyên khoa và Matching Engine">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'specialties', label: 'Chuyên khoa' },
          { value: 'clinics', label: 'Phòng khám' },
        ]}
      />
      {tab === 'specialties' ? <Specialties /> : <Clinics />}
    </AdminPage>
  )
}

// ───────────────────────── Chuyên khoa ─────────────────────────
interface SpecForm {
  id?: number
  name: string
  slug: string
  description: string
  icon: string
  related: string[]
  status: 'ACTIVE' | 'INACTIVE'
}
const emptySpec: SpecForm = { name: '', slug: '', description: '', icon: 'stethoscope', related: [], status: 'ACTIVE' }

function Specialties() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['specialties', 'all'], queryFn: () => get<Specialty[]>('specialties?all=true'), staleTime: 60_000 })
  const [form, setForm] = useState<SpecForm | null>(null)
  const [slugTouched, setSlugTouched] = useState(false)

  const save = useMutation({
    mutationFn: (f: SpecForm) => {
      const body = { name: f.name.trim(), slug: f.slug.trim(), description: f.description.trim(), icon: f.icon, related: f.related, status: f.status }
      return f.id ? patch(`specialties/${f.id}`, body) : post('specialties', body)
    },
    onSuccess: (_r, f) => {
      toast.success(f.id ? 'Đã cập nhật chuyên khoa' : 'Đã thêm chuyên khoa')
      setForm(null)
      qc.invalidateQueries({ queryKey: ['specialties'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const toggle = useMutation({
    mutationFn: (s: Specialty) => patch(`specialties/${s.id}`, { status: s.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['specialties'] }),
    onError: (e) => toast.error(errorMessage(e)),
  })

  const items = list.data || []
  const nameOf = (slug: string) => items.find((s) => s.slug === slug)?.name || slug

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Btn
          onClick={() => {
            setSlugTouched(false)
            setForm({ ...emptySpec })
          }}
        >
          <Plus className="h-4 w-4" /> Thêm chuyên khoa
        </Btn>
      </div>
      {list.isLoading && <Spinner />}
      {list.error && <ErrorBox message={errorMessage(list.error)} onRetry={() => list.refetch()} />}
      {list.data && !items.length && <Empty title="Chưa có chuyên khoa" />}
      {items.length > 0 && (
        <TableWrap>
          <thead>
            <tr>
              <th className={th}>Chuyên khoa</th>
              <th className={th}>Slug</th>
              <th className={th}>Mô tả</th>
              <th className={th}>Chuyên khoa liên quan</th>
              <th className={`${th} text-right`}>Bác sĩ</th>
              <th className={`${th} text-right`}>Sẵn sàng</th>
              <th className={th}>Trạng thái</th>
              <th className={`${th} text-right`}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className={s.status === 'INACTIVE' ? 'text-slate-500' : 'hover:bg-slate-50/60'}>
                <td className={td}>
                  <span className="inline-flex items-center gap-2 font-medium text-slate-900">
                    <SpecialtyIcon icon={s.icon} className="h-4 w-4 text-teal-700" />
                    {s.name}
                  </span>
                </td>
                <td className={`${td} font-mono text-xs`}>{s.slug}</td>
                <td className={`${td} max-w-[280px] truncate`} title={s.description || ''}>
                  {s.description || '—'}
                </td>
                <td className={`${td} text-xs`}>{s.related?.length ? s.related.map(nameOf).join(', ') : '—'}</td>
                <td className={`${td} text-right tabular-nums`}>{s.doctorCount}</td>
                <td className={`${td} text-right tabular-nums`}>{s.onlineCount}</td>
                <td className={td}>
                  <StatusBadge status={s.status === 'ACTIVE' ? 'SUCCESS' : 'CANCELLED'} label={s.status === 'ACTIVE' ? 'Đang dùng' : 'Ngừng dùng'} />
                </td>
                <td className={`${td} text-right`}>
                  <div className="flex justify-end gap-1.5">
                    <Btn variant="ghost" className="px-2 py-1.5 text-xs" loading={toggle.isPending && toggle.variables?.id === s.id} onClick={() => toggle.mutate(s)}>
                      {s.status === 'ACTIVE' ? 'Ngừng dùng' : 'Dùng lại'}
                    </Btn>
                    <Btn
                      variant="outline"
                      className="px-2.5 py-1.5 text-xs"
                      onClick={() => {
                        setSlugTouched(true)
                        setForm({ id: s.id, name: s.name, slug: s.slug, description: s.description || '', icon: s.icon || 'stethoscope', related: s.related || [], status: s.status })
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Sửa
                    </Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Modal
        open={!!form}
        wide
        onClose={() => setForm(null)}
        title={form?.id ? 'Sửa chuyên khoa' : 'Thêm chuyên khoa'}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setForm(null)}>
              Hủy
            </Btn>
            <Btn loading={save.isPending} disabled={!form || form.name.trim().length < 2 || !/^[a-z0-9-]+$/.test(form.slug)} onClick={() => form && save.mutate(form)}>
              Lưu
            </Btn>
          </>
        }
      >
        {form && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tên chuyên khoa">
                <input value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugTouched ? form.slug : slugify(e.target.value) })} className={inputCls} />
              </Field>
              <Field label="Slug" hint="Chỉ gồm a-z, 0-9 và dấu gạch ngang">
                <input
                  value={form.slug}
                  maxLength={40}
                  onChange={(e) => {
                    setSlugTouched(true)
                    setForm({ ...form, slug: e.target.value.toLowerCase() })
                  }}
                  className={cn(inputCls, 'font-mono')}
                />
              </Field>
            </div>
            <Field label="Mô tả">
              <textarea rows={2} maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Biểu tượng">
              <div className="flex flex-wrap gap-1.5">
                {ICONS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    title={i}
                    onClick={() => setForm({ ...form, icon: i })}
                    className={cn('rounded-lg border p-2', form.icon === i ? 'border-teal-700 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600 hover:border-teal-300')}
                  >
                    <SpecialtyIcon icon={i} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Chuyên khoa liên quan" hint="Dùng làm phương án dự phòng khi không có bác sĩ đúng chuyên khoa (tối đa 5)">
              <div className="flex flex-wrap gap-1.5">
                {items
                  .filter((s) => s.id !== form.id)
                  .map((s) => {
                    const on = form.related.includes(s.slug)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={!on && form.related.length >= 5}
                        onClick={() => setForm({ ...form, related: on ? form.related.filter((x) => x !== s.slug) : [...form.related, s.slug] })}
                        className={cn('rounded-full border px-2.5 py-1 text-xs disabled:opacity-40', on ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 text-slate-700 hover:border-teal-300')}
                      >
                        {s.name}
                      </button>
                    )
                  })}
              </div>
            </Field>
            <Field label="Trạng thái">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SpecForm['status'] })} className={selectCls}>
                <option value="ACTIVE">Đang dùng</option>
                <option value="INACTIVE">Ngừng dùng (ẩn khỏi bệnh nhân)</option>
              </select>
            </Field>
          </>
        )}
      </Modal>
    </>
  )
}

// ───────────────────────── Phòng khám ─────────────────────────
interface ClinicForm {
  id?: number
  name: string
  address: string
  district: string
  phone: string
  latitude: number
  longitude: number
  status: 'ACTIVE' | 'INACTIVE'
}

function Clinics() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['clinics'], queryFn: () => get<Clinic[]>('clinics'), staleTime: 60_000 })
  const [selected, setSelected] = useState<number | null>(null)
  const [form, setForm] = useState<ClinicForm | null>(null)
  const [removing, setRemoving] = useState<Clinic | null>(null)

  const save = useMutation({
    mutationFn: (f: ClinicForm) => {
      const body = { name: f.name.trim(), address: f.address.trim() || undefined, district: f.district.trim() || undefined, phone: f.phone.trim() || undefined, latitude: f.latitude, longitude: f.longitude, status: f.status }
      return f.id ? patch(`clinics/${f.id}`, body) : post('clinics', body)
    },
    onSuccess: (_r, f) => {
      toast.success(f.id ? 'Đã cập nhật phòng khám' : 'Đã thêm phòng khám')
      setForm(null)
      qc.invalidateQueries({ queryKey: ['clinics'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (c: Clinic) => del(`clinics/${c.id}`),
    onSuccess: () => {
      toast.success('Đã xóa phòng khám')
      setRemoving(null)
      qc.invalidateQueries({ queryKey: ['clinics'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const items = list.data || []
  const markers = useMemo<MapMarker[]>(
    () => items.map((c) => ({ id: c.id, lat: c.latitude, lng: c.longitude, kind: 'clinic', label: c.name, onClick: () => setSelected(c.id) })),
    [items],
  )
  const formMarkers = useMemo<MapMarker[]>(() => items.filter((c) => c.id !== form?.id).map((c) => ({ id: c.id, lat: c.latitude, lng: c.longitude, kind: 'clinic', label: c.name })), [items, form?.id])
  const edit = (c: Clinic) => setForm({ id: c.id, name: c.name, address: c.address || '', district: c.district || '', phone: c.phone || '', latitude: c.latitude, longitude: c.longitude, status: c.status })
  const coordsOk = form && Number.isFinite(form.latitude) && Number.isFinite(form.longitude) && Math.abs(form.latitude) <= 90 && Math.abs(form.longitude) <= 180

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Btn onClick={() => setForm({ name: '', address: '', district: '', phone: '', latitude: DANANG.lat, longitude: DANANG.lng, status: 'ACTIVE' })}>
          <Plus className="h-4 w-4" /> Thêm phòng khám
        </Btn>
      </div>
      {list.isLoading && <Spinner />}
      {list.error && <ErrorBox message={errorMessage(list.error)} onRetry={() => list.refetch()} />}
      {list.data && !items.length && <Empty title="Chưa có phòng khám" />}
      {items.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-5">
          <Card className="overflow-hidden p-0 xl:col-span-2">
            <MapView center={DANANG} markers={markers} zoom={12} fitMarkers showCenter={false} selectedId={selected} className="h-[360px] w-full xl:h-full xl:min-h-[420px]" />
          </Card>
          <div className="xl:col-span-3">
            <TableWrap>
              <thead>
                <tr>
                  <th className={th}>Phòng khám</th>
                  <th className={th}>Quận</th>
                  <th className={th}>Điện thoại</th>
                  <th className={`${th} text-right`}>Bác sĩ</th>
                  <th className={th}>Trạng thái</th>
                  <th className={`${th} text-right`}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} onClick={() => setSelected(c.id)} className={cn('cursor-pointer', selected === c.id ? 'bg-teal-50/60' : 'hover:bg-slate-50/60')}>
                    <td className={td}>
                      <p className="font-medium text-slate-900">{c.name}</p>
                      <p className="max-w-[300px] truncate text-xs text-slate-500">{c.address || '—'}</p>
                    </td>
                    <td className={td}>{c.district || '—'}</td>
                    <td className={`${td} tabular-nums`}>{c.phone || '—'}</td>
                    <td className={`${td} text-right tabular-nums`}>{c.doctor_count}</td>
                    <td className={td}>
                      <StatusBadge status={c.status === 'ACTIVE' ? 'SUCCESS' : 'CANCELLED'} label={c.status === 'ACTIVE' ? 'Hoạt động' : 'Tạm ngưng'} />
                    </td>
                    <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1.5">
                        <Btn variant="outline" className="px-2.5 py-1.5 text-xs" onClick={() => edit(c)}>
                          <Pencil className="h-3.5 w-3.5" /> Sửa
                        </Btn>
                        <Btn variant="ghost" className="px-2 py-1.5 text-xs text-rose-700" onClick={() => setRemoving(c)} aria-label={`Xóa ${c.name}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        </div>
      )}

      <Modal
        open={!!form}
        wide
        onClose={() => setForm(null)}
        title={form?.id ? 'Sửa phòng khám' : 'Thêm phòng khám'}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setForm(null)}>
              Hủy
            </Btn>
            <Btn loading={save.isPending} disabled={!form || form.name.trim().length < 3 || !coordsOk} onClick={() => form && save.mutate(form)}>
              Lưu
            </Btn>
          </>
        }
      >
        {form && (
          <>
            <Field label="Tên phòng khám">
              <input value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Địa chỉ">
              <input value={form.address} maxLength={200} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Quận / huyện">
                <input value={form.district} maxLength={60} onChange={(e) => setForm({ ...form, district: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Điện thoại">
                <input value={form.phone} maxLength={30} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Trạng thái">
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ClinicForm['status'] })} className={cn(selectCls, 'w-full')}>
                  <option value="ACTIVE">Hoạt động</option>
                  <option value="INACTIVE">Tạm ngưng</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Vĩ độ">
                <input type="number" step="0.0001" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: parseFloat(e.target.value) })} className={inputCls} />
              </Field>
              <Field label="Kinh độ">
                <input type="number" step="0.0001" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: parseFloat(e.target.value) })} className={inputCls} />
              </Field>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Vị trí trên bản đồ</p>
              <p className="mb-2 text-xs text-slate-500">Bấm lên bản đồ để chọn vị trí. Chấm xanh dương là vị trí đang chọn, chấm tím là các phòng khám khác.</p>
              {coordsOk && (
                <MapView
                  center={{ lat: form.latitude, lng: form.longitude }}
                  markers={formMarkers}
                  zoom={15}
                  onPick={(p) => setForm((f) => (f ? { ...f, latitude: Math.round(p.lat * 1e6) / 1e6, longitude: Math.round(p.lng * 1e6) / 1e6 } : f))}
                  className="h-56 w-full overflow-hidden rounded-xl border border-slate-200"
                />
              )}
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Xóa phòng khám"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setRemoving(null)}>
              Hủy
            </Btn>
            <Btn variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing)}>
              Xóa
            </Btn>
          </>
        }
      >
        {removing && (
          <p className="text-sm text-slate-700">
            Xóa <b>{removing.name}</b> khỏi danh mục?
            {removing.doctor_count > 0 && ` Phòng khám đang có ${removing.doctor_count} bác sĩ; hồ sơ của họ vẫn giữ liên kết cũ cho đến khi bác sĩ cập nhật.`}
          </p>
        )}
      </Modal>
    </>
  )
}
