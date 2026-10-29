import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth, homeFor } from '@/lib/auth'
import { errorMessage, get } from '@/lib/http'
import { Btn, Chip, ErrorBox, Field, inputCls } from '@/components/kit'
import { AuthFrame } from './Login'

interface Spec {
  id: number
  name: string
}

export default function Register() {
  const { register } = useAuth()
  const nav = useNavigate()
  const [role, setRole] = useState<'PATIENT' | 'DOCTOR'>('PATIENT')
  const [f, setF] = useState({ fullName: '', email: '', phone: '', password: '', specialtyId: '', licenseNumber: '', experienceYears: '', consultationFee: '250000' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const specs = useQuery({ queryKey: ['specialties'], queryFn: () => get<Spec[]>('specialties'), enabled: role === 'DOCTOR' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const body: Record<string, unknown> = { fullName: f.fullName, email: f.email, phone: f.phone, password: f.password, role }
      if (role === 'DOCTOR') Object.assign(body, { specialtyId: Number(f.specialtyId), licenseNumber: f.licenseNumber, experienceYears: Number(f.experienceYears || 0), consultationFee: Number(f.consultationFee || 0) })
      const u = await register(body)
      nav(homeFor(u.role), { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthFrame title="Tạo tài khoản" subtitle="Mật khẩu được mã hóa một chiều, không lưu dạng văn bản.">
      <div className="mb-5 flex gap-2">
        <Chip active={role === 'PATIENT'} onClick={() => setRole('PATIENT')}>
          Tôi là người bệnh
        </Chip>
        <Chip active={role === 'DOCTOR'} onClick={() => setRole('DOCTOR')}>
          Tôi là bác sĩ
        </Chip>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Họ và tên">
          <input className={inputCls} value={f.fullName} onChange={set('fullName')} required minLength={2} />
        </Field>
        <Field label="Email">
          <input className={inputCls} type="email" value={f.email} onChange={set('email')} required />
        </Field>
        <Field label="Số điện thoại">
          <input className={inputCls} value={f.phone} onChange={set('phone')} placeholder="0905xxxxxx" />
        </Field>
        <Field label="Mật khẩu" hint="Tối thiểu 8 ký tự, có chữ và số">
          <input className={inputCls} type="password" value={f.password} onChange={set('password')} required minLength={8} />
        </Field>
        {role === 'DOCTOR' && (
          <div className="space-y-4 rounded-2xl bg-slate-50 p-4">
            <p className="text-sm text-slate-600">Hồ sơ bác sĩ cần được quản trị viên duyệt trước khi bạn nhận được yêu cầu khám.</p>
            <Field label="Chuyên khoa chính">
              <select className={inputCls} value={f.specialtyId} onChange={set('specialtyId')} required>
                <option value="">Chọn chuyên khoa</option>
                {specs.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Số chứng chỉ hành nghề (prototype)">
              <input className={inputCls} value={f.licenseNumber} onChange={set('licenseNumber')} required placeholder="CCHN-DN-…" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Số năm kinh nghiệm">
                <input className={inputCls} type="number" min={0} value={f.experienceYears} onChange={set('experienceYears')} />
              </Field>
              <Field label="Phí khám (đ)">
                <input className={inputCls} type="number" min={0} step={10000} value={f.consultationFee} onChange={set('consultationFee')} />
              </Field>
            </div>
          </div>
        )}
        {error && <ErrorBox message={error} />}
        <Btn type="submit" className="w-full" loading={loading}>
          Đăng ký
        </Btn>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        Đã có tài khoản?{' '}
        <Link to="/login" className="font-semibold text-teal-700">
          Đăng nhập
        </Link>
      </p>
    </AuthFrame>
  )
}
