import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BarChart3, Bell, CalendarDays, ChevronRight, LogOut, Pencil } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { errorMessage, get, patch } from '@/lib/http'
import { CTYPE, relative, vnd } from '@/lib/format'
import { DANANG, type LatLng } from '@/lib/location'
import { HeaderActions } from '@/components/layouts'
import MapView, { type MapMarker } from '@/components/MapView'
import { Avatar, Btn, Card, ErrorBox, Field, PageHeader, RatingInline, SectionTitle, Spinner, StatusBadge, inputCls } from '@/components/kit'
import { cn } from '@/lib/utils'
import { LOAD_ERROR, inDanang, useDoctorMe, type DoctorMe } from './common'

interface Spec {
  id: number
  name: string
  status?: string
}
interface Clinic {
  id: number
  name: string
  address?: string
  latitude?: number | null
  longitude?: number | null
  status?: string
}

interface FormState {
  fullName: string
  phone: string
  education: string
  description: string
  experienceYears: string
  consultationFee: string
  consultationTypes: string[]
  clinicId: string
  licenseNumber: string
  specialtyIds: number[]
}

const fromDoctor = (d: DoctorMe): FormState => ({
  fullName: d.fullName || '',
  phone: d.phone || '',
  education: d.education || '',
  description: d.description || '',
  experienceYears: d.experienceYears != null ? String(d.experienceYears) : '',
  consultationFee: d.consultationFee != null ? String(d.consultationFee) : '',
  consultationTypes: d.consultationTypes || [],
  clinicId: d.clinic?.id ? String(d.clinic.id) : '',
  licenseNumber: d.licenseNumber || '',
  specialtyIds: [d.specialtyId, ...(d.specialties || []).map((s) => s.id)].filter((x, i, a): x is number => x != null && a.indexOf(x) === i).slice(0, 3),
})

const VERIFY_LABEL: Record<string, string> = { APPROVED: 'Đã xác minh', PENDING: 'Chờ duyệt', REJECTED: 'Bị từ chối' }

export default function ProfilePage() {
  const { logout, refreshMe } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const me = useDoctorMe()
  const specs = useQuery({ queryKey: ['specialties'], queryFn: () => get<Spec[]>('specialties'), staleTime: 10 * 60_000 })
  const clinics = useQuery({ queryKey: ['clinics'], queryFn: () => get<Clinic[]>('clinics'), staleTime: 10 * 60_000 })

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [picked, setPicked] = useState<LatLng | null>(null)

  useEffect(() => {
    if (me.data && !editing) setForm(fromDoctor(me.data))
  }, [me.data, editing])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch<DoctorMe>('doctors/me', body),
    onSuccess: async (d) => {
      qc.setQueryData(['doctor-me'], d)
      setEditing(false)
      toast.success('Đã lưu hồ sơ')
      refreshMe().catch(() => {})
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const saveLocation = useMutation({
    mutationFn: (p: LatLng) => patch('doctors/me/location', { lat: p.lat, lng: p.lng }),
    onSuccess: async () => {
      setPicked(null)
      await qc.invalidateQueries({ queryKey: ['doctor-me'] })
      toast.success('Đã cập nhật vị trí hành nghề')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const submit = () => {
    if (!form) return
    if (form.fullName.trim().length < 2) return toast.error('Họ tên cần ít nhất 2 ký tự')
    if (form.phone && !/^0\d{9,10}$/.test(form.phone.trim())) return toast.error('Số điện thoại không hợp lệ')
    if (!form.consultationTypes.length) return toast.error('Chọn ít nhất một hình thức khám')
    if (!form.specialtyIds.length) return toast.error('Chọn ít nhất một chuyên khoa')
    save.mutate({
      fullName: form.fullName.trim(),
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      education: form.education.trim(),
      description: form.description.trim(),
      ...(form.experienceYears !== '' ? { experienceYears: Number(form.experienceYears) } : {}),
      ...(form.consultationFee !== '' ? { consultationFee: Number(form.consultationFee) } : {}),
      consultationTypes: form.consultationTypes,
      clinicId: form.clinicId ? Number(form.clinicId) : null,
      licenseNumber: form.licenseNumber.trim(),
      specialtyIds: form.specialtyIds,
    })
  }

  const d = me.data
  const center: LatLng = d?.latitude != null && d.longitude != null ? { lat: d.latitude, lng: d.longitude } : DANANG
  const clinicList = useMemo(() => (clinics.data || []).filter((c) => !c.status || c.status === 'ACTIVE'), [clinics.data])
  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = []
    const c = clinicList.find((x) => x.id === d?.clinic?.id)
    if (c?.latitude != null && c.longitude != null) m.push({ id: `c${c.id}`, lat: c.latitude, lng: c.longitude, kind: 'clinic', label: c.name })
    if (picked) m.push({ id: 'picked', lat: picked.lat, lng: picked.lng, kind: 'highlight', label: 'Vị trí mới' })
    return m
  }, [clinicList, d?.clinic?.id, picked])

  const onPick = (p: LatLng) => {
    if (!inDanang(p.lat, p.lng)) return toast.warning('Chỉ chọn được vị trí trong khu vực Đà Nẵng.')
    setPicked(p)
  }

  const doLogout = async () => {
    await logout()
    nav('/login')
  }

  return (
    <div>
      <PageHeader title="Tài khoản" right={<HeaderActions notificationsPath="/d/notifications" />} />
      <div className="px-4 pb-6 pt-4">
        {me.isLoading || (!form && !me.isError) ? (
          <Spinner />
        ) : me.isError || !d || !form ? (
          <ErrorBox message={LOAD_ERROR} onRetry={() => me.refetch()} />
        ) : (
          <>
            <Card>
              <div className="flex items-center gap-3">
                <Avatar src={d.avatar} doctor size={56} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">BS. {d.fullName}</p>
                  <p className="truncate text-sm text-slate-600">{d.specialties.map((s) => s.name).join(', ') || 'Chưa chọn chuyên khoa'}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge status={d.verificationStatus} label={VERIFY_LABEL[d.verificationStatus]} />
                    <RatingInline rating={d.rating} total={d.totalReviews} />
                  </div>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Số chứng chỉ hành nghề</dt>
                  <dd className="font-medium text-slate-900">{d.licenseNumber || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Phí khám</dt>
                  <dd className="font-medium text-slate-900">{vnd(d.consultationFee)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Kinh nghiệm</dt>
                  <dd className="font-medium text-slate-900">{d.experienceYears != null ? `${d.experienceYears} năm` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Hình thức</dt>
                  <dd className="font-medium text-slate-900">{d.consultationTypes.map((t) => (t === 'ONLINE' ? 'Online' : 'Trực tiếp')).join(', ') || '—'}</dd>
                </div>
              </dl>
              {d.verificationStatus === 'REJECTED' && d.verificationNote && (
                <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">Lý do từ chối: {d.verificationNote}</p>
              )}
              {d.verificationStatus === 'PENDING' && (
                <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Hồ sơ đang chờ quản trị viên duyệt. Bạn chưa xuất hiện trong hệ thống matching.</p>
              )}
            </Card>

            <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {[
                { to: '/d/stats', icon: BarChart3, label: 'Thống kê' },
                { to: '/d/bookings', icon: CalendarDays, label: 'Lịch khám' },
                { to: '/d/notifications', icon: Bell, label: 'Thông báo' },
              ].map((l) => (
                <Link key={l.to} to={l.to} className="flex items-center gap-3 px-4 py-3 text-sm text-slate-800 hover:bg-slate-50">
                  <l.icon className="h-4 w-4 text-slate-500" />
                  <span className="flex-1">{l.label}</span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </Link>
              ))}
            </div>

            <SectionTitle
              action={
                !editing && (
                  <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-sm font-medium text-teal-700">
                    <Pencil className="h-3.5 w-3.5" /> Chỉnh sửa
                  </button>
                )
              }
            >
              Hồ sơ chuyên môn
            </SectionTitle>
            {!editing ? (
              <Card className="space-y-3 text-sm">
                <InfoRow label="Email" value={d.email} />
                <InfoRow label="Số điện thoại" value={d.phone} />
                <InfoRow label="Phòng khám" value={d.clinic ? `${d.clinic.name}${d.clinic.address ? ` – ${d.clinic.address}` : ''}` : null} />
                <InfoRow label="Học vấn" value={d.education} />
                <InfoRow label="Giới thiệu" value={d.description} />
              </Card>
            ) : (
              <Card className="space-y-4">
                <Field label="Họ và tên">
                  <input className={inputCls} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} maxLength={80} />
                </Field>
                <Field label="Số điện thoại">
                  <input className={inputCls} inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0905xxxxxx" />
                </Field>
                <Field label="Số chứng chỉ hành nghề">
                  <input className={inputCls} value={form.licenseNumber} onChange={(e) => set('licenseNumber', e.target.value)} maxLength={40} />
                </Field>
                <Field label="Chuyên khoa" hint="Tối đa 3 chuyên khoa, chuyên khoa chọn đầu tiên là chuyên khoa chính.">
                  {specs.isError ? (
                    <ErrorBox message={LOAD_ERROR} onRetry={() => specs.refetch()} />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(specs.data || []).map((s) => {
                        const idx = form.specialtyIds.indexOf(s.id)
                        const on = idx >= 0
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              if (on) set('specialtyIds', form.specialtyIds.filter((x) => x !== s.id))
                              else if (form.specialtyIds.length >= 3) toast.warning('Chỉ chọn tối đa 3 chuyên khoa')
                              else set('specialtyIds', [...form.specialtyIds, s.id])
                            }}
                            className={cn('rounded-full border px-3 py-1.5 text-sm transition', on ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300')}
                          >
                            {s.name}
                            {idx === 0 && <span className="ml-1 text-xs opacity-80">(chính)</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </Field>
                <Field label="Phòng khám">
                  <select className={inputCls} value={form.clinicId} onChange={(e) => set('clinicId', e.target.value)}>
                    <option value="">Không thuộc phòng khám</option>
                    {clinicList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Số năm kinh nghiệm">
                    <input className={inputCls} type="number" min={0} max={60} inputMode="numeric" value={form.experienceYears} onChange={(e) => set('experienceYears', e.target.value)} />
                  </Field>
                  <Field label="Phí khám (đ)">
                    <input className={inputCls} type="number" min={0} step={10000} inputMode="numeric" value={form.consultationFee} onChange={(e) => set('consultationFee', e.target.value)} />
                  </Field>
                </div>
                <div>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Hình thức khám</span>
                  <div className="flex gap-2">
                    {(['ONLINE', 'IN_PERSON'] as const).map((t) => {
                      const on = form.consultationTypes.includes(t)
                      return (
                        <label key={t} className={cn('flex flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm', on ? 'border-teal-600 bg-teal-50 text-teal-900' : 'border-slate-200 text-slate-700')}>
                          <input
                            type="checkbox"
                            className="accent-teal-700"
                            checked={on}
                            onChange={() => set('consultationTypes', on ? form.consultationTypes.filter((x) => x !== t) : [...form.consultationTypes, t])}
                          />
                          {CTYPE[t]}
                        </label>
                      )
                    })}
                  </div>
                </div>
                <Field label="Học vấn">
                  <input className={inputCls} value={form.education} onChange={(e) => set('education', e.target.value)} maxLength={300} />
                </Field>
                <Field label="Giới thiệu">
                  <textarea className={cn(inputCls, 'min-h-24')} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={1500} />
                </Field>
                <div className="flex gap-2">
                  <Btn variant="outline" className="flex-1" disabled={save.isPending} onClick={() => setEditing(false)}>
                    Hủy
                  </Btn>
                  <Btn className="flex-1" loading={save.isPending} onClick={submit}>
                    Lưu hồ sơ
                  </Btn>
                </div>
              </Card>
            )}

            <SectionTitle>Vị trí hành nghề</SectionTitle>
            <Card className="p-0">
              <MapView center={center} markers={markers} zoom={14} onPick={onPick} className="h-52 w-full rounded-t-2xl" />
              <div className="space-y-2 px-4 py-3">
                <p className="text-xs text-slate-500">
                  Chạm lên bản đồ để chọn vị trí phòng khám hoặc nơi hành nghề.
                  {d.locationUpdatedAt && ` Cập nhật lần cuối ${relative(d.locationUpdatedAt)}.`}
                </p>
                {picked && (
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-sm tabular-nums text-slate-700">
                      {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
                    </span>
                    <Btn variant="ghost" className="px-3 py-2" onClick={() => setPicked(null)}>
                      Bỏ
                    </Btn>
                    <Btn className="px-3 py-2" loading={saveLocation.isPending} onClick={() => saveLocation.mutate(picked)}>
                      Lưu vị trí này
                    </Btn>
                  </div>
                )}
              </div>
            </Card>

            <Btn variant="outline" className="mt-5 w-full text-rose-700" onClick={doLogout}>
              <LogOut className="h-4 w-4" /> Đăng xuất
            </Btn>
          </>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn('whitespace-pre-line', value ? 'text-slate-900' : 'text-slate-400')}>{value || 'Chưa cập nhật'}</p>
    </div>
  )
}
