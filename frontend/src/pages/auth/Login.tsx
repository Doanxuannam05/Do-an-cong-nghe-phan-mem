import { useState } from 'react'
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { ShieldCheck, Stethoscope, UserRound, LayoutDashboard } from 'lucide-react'
import { useAuth, homeFor } from '@/lib/auth'
import { errorMessage } from '@/lib/http'
import { Btn, ErrorBox, Field, inputCls } from '@/components/kit'

const DEMO = [
  { email: 'patient@demo.vn', label: 'Người bệnh', name: 'Nguyễn Văn An', icon: UserRound },
  { email: 'doctor@demo.vn', label: 'Bác sĩ', name: 'BS. Trần Minh Khoa', icon: Stethoscope },
  { email: 'admin@demo.vn', label: 'Quản trị', name: 'Admin dashboard', icon: LayoutDashboard },
]

export function AuthFrame({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-white px-6 py-8">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white">
            <Stethoscope className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold text-slate-900">MediGo</span>
        </div>
        <h1 className="mt-8 text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-6 flex-1">{children}</div>
        <p className="mt-6 flex items-start gap-2 text-xs text-slate-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          Prototype phục vụ đề tài NCKH sinh viên. Toàn bộ bác sĩ, phòng khám và người bệnh là dữ liệu mô phỏng tại Đà Nẵng, không chứa thông tin y tế thật.
        </p>
      </div>
    </div>
  )
}

export default function Login() {
  const { login, user } = useAuth()
  const nav = useNavigate()
  const loc = useLocation() as { state?: { from?: string } }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  if (user) return <Navigate to={homeFor(user.role)} replace />

  const submit = async (e?: React.FormEvent, demo?: string) => {
    e?.preventDefault()
    setError(null)
    setLoading(demo || 'form')
    try {
      const u = await login(demo || email, demo ? 'Demo@123' : password)
      const from = loc.state?.from
      nav(from && from.startsWith(homeFor(u.role)) ? from : homeFor(u.role), { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(null)
    }
  }

  return (
    <AuthFrame title="Kết nối với bác sĩ gần bạn" subtitle="Tìm bác sĩ theo vị trí, gửi yêu cầu khám ngay hoặc đặt lịch – như gọi xe, nhưng là bác sĩ.">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Đăng nhập nhanh tài khoản demo</p>
      <div className="grid grid-cols-3 gap-2">
        {DEMO.map((d) => (
          <button key={d.email} onClick={() => submit(undefined, d.email)} disabled={!!loading} className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 p-3 text-center transition hover:border-teal-400 hover:bg-teal-50/40 disabled:opacity-60">
            <d.icon className="h-5 w-5 text-teal-700" />
            <span className="text-sm font-semibold text-slate-800">{d.label}</span>
            <span className="text-[11px] leading-tight text-slate-500">{loading === d.email ? 'Đang vào…' : d.name}</span>
          </button>
        ))}
      </div>
      <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> hoặc dùng email <span className="h-px flex-1 bg-slate-200" />
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <input className={inputCls} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ban@email.com" required />
        </Field>
        <Field label="Mật khẩu">
          <input className={inputCls} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        </Field>
        {error && <ErrorBox message={error} />}
        <Btn type="submit" className="w-full" loading={loading === 'form'}>
          Đăng nhập
        </Btn>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link to="/forgot" className="text-slate-600 hover:text-teal-700">
          Quên mật khẩu?
        </Link>
        <Link to="/register" className="font-semibold text-teal-700">
          Tạo tài khoản
        </Link>
      </div>
      <div className="mt-6 space-y-1 text-xs text-slate-500">
        <p>Mật khẩu tài khoản demo: Demo@123</p>
        <p>
          59 bác sĩ mô phỏng đăng nhập bằng email dạng <b>bs001@sim.medigo.vn</b> … <b>bs059@sim.medigo.vn</b> (cùng mật khẩu). Email của từng bác sĩ xem ở
          Admin › Bác sĩ & duyệt hồ sơ.
        </p>
      </div>
    </AuthFrame>
  )
}
