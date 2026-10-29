import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Bell, CalendarDays, ChevronRight, LogOut, MessageSquareWarning, Sparkles } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { errorMessage, get, patch, post } from '@/lib/http'
import { usePatientProfile, useMyLocation } from '@/lib/hooks'
import { dateTime } from '@/lib/format'
import MapView from '@/components/MapView'
import LocationBar from '@/components/LocationBar'
import { Avatar, Btn, Card, Field, inputCls, PageHeader, SectionTitle, Spinner, StatusBadge } from '@/components/kit'

interface Complaint {
  id: number
  title: string
  status: string
  target_type: string
  booking_code: string | null
  admin_note: string | null
  created_at: string
}

export default function PatientProfile() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const prof = usePatientProfile()
  const loc = useMyLocation()
  const [f, setF] = useState({ fullName: '', phone: '', dateOfBirth: '', gender: 'MALE', address: '' })
  const [showComplaints, setShowComplaints] = useState(false)
  const complaints = useQuery({ queryKey: ['complaints', 'mine'], queryFn: () => get<Complaint[]>('complaints/mine'), enabled: showComplaints })
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (prof.data) setF({ fullName: prof.data.fullName, phone: prof.data.phone || '', dateOfBirth: prof.data.dateOfBirth || '', gender: prof.data.gender || 'MALE', address: prof.data.address || '' })
  }, [prof.data])

  const save = useMutation({
    mutationFn: () => patch('patients/me', f),
    onSuccess: () => {
      toast.success('Đã lưu hồ sơ')
      qc.invalidateQueries({ queryKey: ['patient-me'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const saveLoc = useMutation({
    mutationFn: () => patch('patients/me/location', { lat: loc.location.lat, lng: loc.location.lng }),
    onSuccess: () => {
      toast.success('Đã lưu vị trí vào hồ sơ')
      qc.invalidateQueries({ queryKey: ['patient-me'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const sendFeedback = useMutation({
    mutationFn: () => post('complaints', { targetType: 'SERVICE', title: feedback.slice(0, 80), description: feedback }),
    onSuccess: () => {
      toast.success('Đã gửi góp ý')
      setFeedback('')
      qc.invalidateQueries({ queryKey: ['complaints'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (prof.isLoading) return <><PageHeader title="Tài khoản" /><Spinner /></>

  return (
    <div>
      <PageHeader title="Tài khoản" />
      <div className="space-y-3 p-4">
        <Card className="flex items-center gap-3">
          <Avatar src={prof.data?.avatar} size={56} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">{prof.data?.fullName}</p>
            <p className="truncate text-sm text-slate-500">{user?.email}</p>
            <p className="text-xs text-slate-400">{prof.data?.completedCount} lần khám hoàn thành</p>
          </div>
        </Card>

        <Card className="divide-y divide-slate-100 p-0">
          {[
            { icon: CalendarDays, label: 'Lịch sử khám', to: '/p/bookings' },
            { icon: Bell, label: 'Thông báo', to: '/p/notifications' },
            { icon: Sparkles, label: 'Gợi ý chuyên khoa', to: '/p/ai' },
          ].map((x) => (
            <button key={x.to} onClick={() => nav(x.to)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700">
              <x.icon className="h-4 w-4 text-slate-400" /> <span className="flex-1">{x.label}</span> <ChevronRight className="h-4 w-4 text-slate-300" />
            </button>
          ))}
          <button onClick={() => setShowComplaints(!showComplaints)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700">
            <MessageSquareWarning className="h-4 w-4 text-slate-400" /> <span className="flex-1">Báo cáo & góp ý của tôi</span> <ChevronRight className={`h-4 w-4 text-slate-300 transition ${showComplaints ? 'rotate-90' : ''}`} />
          </button>
        </Card>

        {showComplaints && (
          <Card className="space-y-3">
            {complaints.isLoading ? <Spinner /> : (complaints.data || []).map((c) => (
              <div key={c.id} className="border-b border-slate-100 pb-2 text-sm last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-800">{c.title}</p>
                  <StatusBadge status={c.status} />
                </div>
                <p className="text-xs text-slate-500">{c.booking_code || 'Dịch vụ'} · {dateTime(c.created_at)}</p>
                {c.admin_note && <p className="mt-1 text-xs text-slate-600">Phản hồi: {c.admin_note}</p>}
              </div>
            ))}
            {complaints.data?.length === 0 && <p className="text-sm text-slate-500">Bạn chưa gửi báo cáo nào.</p>}
            <textarea className={inputCls} rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Góp ý về dịch vụ (tối thiểu 5 ký tự)" maxLength={500} />
            <Btn variant="secondary" className="w-full" disabled={feedback.trim().length < 5} loading={sendFeedback.isPending} onClick={() => sendFeedback.mutate()}>Gửi góp ý</Btn>
          </Card>
        )}

        <SectionTitle>Vị trí của tôi</SectionTitle>
        <LocationBar loc={loc} />
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <MapView center={loc.location} className="h-44 w-full" onPick={(p) => loc.set(p, 'manual', 'Điểm đã chọn trên bản đồ')} />
        </div>
        <Btn variant="outline" className="w-full" loading={saveLoc.isPending} onClick={() => saveLoc.mutate()}>Lưu vị trí này vào hồ sơ</Btn>

        <SectionTitle>Thông tin cá nhân</SectionTitle>
        <Card className="space-y-3">
          <Field label="Họ và tên"><input className={inputCls} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
          <Field label="Số điện thoại"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ngày sinh"><input type="date" className={inputCls} value={f.dateOfBirth} onChange={(e) => setF({ ...f, dateOfBirth: e.target.value })} /></Field>
            <Field label="Giới tính">
              <select className={inputCls} value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
                <option value="MALE">Nam</option>
                <option value="FEMALE">Nữ</option>
                <option value="OTHER">Khác</option>
              </select>
            </Field>
          </div>
          <Field label="Địa chỉ"><input className={inputCls} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Btn className="w-full" loading={save.isPending} onClick={() => save.mutate()}>Lưu thay đổi</Btn>
          <p className="text-xs text-slate-500">MVP không lưu hồ sơ bệnh án điện tử. Chỉ lưu thông tin cần thiết để kết nối với bác sĩ.</p>
        </Card>

        <Btn
          variant="ghost"
          className="w-full text-rose-700"
          onClick={async () => {
            await logout()
            nav('/login')
          }}
        >
          <LogOut className="h-4 w-4" /> Đăng xuất
        </Btn>
      </div>
    </div>
  )
}
