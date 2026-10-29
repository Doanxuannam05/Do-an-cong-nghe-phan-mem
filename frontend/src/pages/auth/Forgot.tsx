import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage, post } from '@/lib/http'
import { Btn, ErrorBox, Field, inputCls } from '@/components/kit'
import { AuthFrame } from './Login'

export default function Forgot() {
  const nav = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const request = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const r = await post<{ message: string; devCode?: string }>('auth/forgot-password', { email })
      setDevCode(r.devCode || null)
      setStep(2)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  const reset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await post('auth/reset-password', { email, code, newPassword: pw })
      toast.success('Đặt lại mật khẩu thành công. Hãy đăng nhập lại.')
      nav('/login')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthFrame title="Quên mật khẩu" subtitle={step === 1 ? 'Nhập email để nhận mã đặt lại (hiệu lực 15 phút).' : `Nhập mã đã gửi tới ${email}.`}>
      {step === 1 ? (
        <form onSubmit={request} className="space-y-4">
          <Field label="Email">
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          {error && <ErrorBox message={error} />}
          <Btn type="submit" className="w-full" loading={loading}>
            Gửi mã
          </Btn>
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-4">
          {devCode && (
            <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              Prototype không gửi email thật. Mã của bạn: <b className="tabular-nums tracking-widest">{devCode}</b>
            </div>
          )}
          <Field label="Mã 6 số">
            <input className={inputCls} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
          </Field>
          <Field label="Mật khẩu mới" hint="Tối thiểu 8 ký tự, có chữ và số">
            <input className={inputCls} type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} />
          </Field>
          {error && <ErrorBox message={error} />}
          <Btn type="submit" className="w-full" loading={loading}>
            Đặt lại mật khẩu
          </Btn>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link to="/login" className="text-teal-700">
          Quay lại đăng nhập
        </Link>
      </p>
    </AuthFrame>
  )
}
