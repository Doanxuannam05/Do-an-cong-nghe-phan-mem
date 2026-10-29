import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Baby, Bandage, Brain, ChevronLeft, Ear, Eye, Flower2, HeartPulse, Inbox, Loader2, MapPin, ScanFace, Smile, Star, Stethoscope, UserRound, Video, Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS, km, vnd } from '@/lib/format'

// ───────── Status badge ─────────
const TONES = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  progress: 'bg-violet-50 text-violet-800 ring-violet-200',
  good: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  bad: 'bg-rose-50 text-rose-800 ring-rose-200',
}
const DOTS = { neutral: 'bg-slate-400', info: 'bg-sky-500', progress: 'bg-violet-500', good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-rose-500' }

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const s = STATUS[status] || { label: status, tone: 'neutral' as const }
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', TONES[s.tone], className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[s.tone])} />
      {label || s.label}
    </span>
  )
}

// ───────── Specialty icon ─────────
const ICONS: Record<string, typeof Ear> = {
  'heart-pulse': HeartPulse, ear: Ear, 'scan-face': ScanFace, baby: Baby, stethoscope: Stethoscope, bandage: Bandage, 'flower-2': Flower2, smile: Smile, eye: Eye, brain: Brain,
}
export function SpecialtyIcon({ icon, className }: { icon?: string | null; className?: string }) {
  const I = (icon && ICONS[icon]) || Stethoscope
  return <I className={className} />
}

// ───────── Stars ─────────
export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${value} sao`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} style={{ width: size, height: size }} className={i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
      ))}
    </span>
  )
}

export function RatingInline({ rating, total }: { rating?: number | null; total?: number | null }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-slate-700">
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      <span className="font-semibold">{rating ? rating.toFixed(1) : 'Mới'}</span>
      {total != null && <span className="text-slate-500">({total})</span>}
    </span>
  )
}

// ───────── Avatar ─────────
export function Avatar({ src, size = 44, doctor }: { src?: string | null; size?: number; doctor?: boolean }) {
  if (src) return <img src={src} alt="" className="rounded-full object-cover bg-slate-100 shrink-0" style={{ width: size, height: size }} />
  const I = doctor ? Stethoscope : UserRound
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700 ring-1 ring-teal-100" style={{ width: size, height: size }}>
      <I style={{ width: size * 0.45, height: size * 0.45 }} />
    </span>
  )
}

// ───────── States ─────────
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-10 text-sm text-slate-500', className)}>
      <Loader2 className="h-4 w-4 animate-spin" /> {label || 'Đang tải…'}
    </div>
  )
}
export function Empty({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center">
      <span className="text-slate-400">{icon || <Inbox className="h-6 w-6" />}</span>
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="max-w-xs text-sm text-slate-500">{hint}</p>}
      {action}
    </div>
  )
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      {message}
      {onRetry && (
        <button onClick={onRetry} className="ml-2 font-semibold underline">
          Thử lại
        </button>
      )}
    </div>
  )
}

// ───────── Layout pieces ─────────
export function PageHeader({ title, back, right, subtitle }: { title: string; back?: boolean | string; right?: ReactNode; subtitle?: string }) {
  const nav = useNavigate()
  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
      {back && (
        <button aria-label="Quay lại" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))} className="-ml-2 rounded-full p-1.5 text-slate-600 hover:bg-slate-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cn('rounded-2xl border border-slate-200 bg-white p-4', onClick && 'cursor-pointer transition hover:border-teal-300 hover:shadow-sm', className)}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-900">{children}</h2>
      {action}
    </div>
  )
}

// ───────── Countdown ─────────
export function useCountdown(until?: string | null) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!until) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [until])
  if (!until) return 0
  return Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000))
}

export function CountdownRing({ until, total = 30, size = 56 }: { until?: string | null; total?: number; size?: number }) {
  const left = useCountdown(until)
  const r = size / 2 - 4
  const c = 2 * Math.PI * r
  const frac = Math.min(1, left / total)
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth="4" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={left <= 8 ? '#e11d48' : '#0f766e'} strokeWidth="4" fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} strokeLinecap="round" style={{ transition: 'stroke-dashoffset .25s linear' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums text-slate-800">{left}s</span>
    </div>
  )
}

// ───────── Doctor card ─────────
export interface DoctorLite {
  id: number
  fullName: string
  avatar?: string | null
  specialty?: { name: string; icon?: string } | null
  clinic?: { name: string } | null
  rating?: number
  totalReviews?: number
  experienceYears?: number
  consultationFee?: number
  consultationTypes?: string[]
  distanceKm?: number | null
  isAvailableNow?: boolean
  status?: string
  matchScore?: number
  isSimulated?: boolean
}

export function DoctorCard({ d, onClick, action, compact }: { d: DoctorLite; onClick?: () => void; action?: ReactNode; compact?: boolean }) {
  return (
    <Card onClick={onClick} className={compact ? 'p-3' : ''}>
      <div className="flex gap-3">
        <div className="relative">
          <Avatar src={d.avatar} doctor size={compact ? 44 : 52} />
          <span className={cn('absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-white', d.isAvailableNow ? 'bg-emerald-500' : d.status === 'BUSY' ? 'bg-violet-500' : 'bg-slate-300')} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-semibold text-slate-900">BS. {d.fullName}</p>
            {d.matchScore != null && <span className="shrink-0 rounded-md bg-teal-50 px-1.5 py-0.5 text-xs font-semibold text-teal-800 tabular-nums">{d.matchScore.toFixed(0)}%</span>}
          </div>
          <p className="truncate text-sm text-slate-600">
            {d.specialty?.name}
            {d.experienceYears != null && ` · ${d.experienceYears} năm KN`}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <RatingInline rating={d.rating} total={d.totalReviews} />
            {d.distanceKm != null && (
              <span className="inline-flex items-center gap-1 text-slate-600">
                <MapPin className="h-3.5 w-3.5" /> {km(d.distanceKm)}
              </span>
            )}
            {d.consultationTypes?.includes('ONLINE') && (
              <span className="inline-flex items-center gap-1 text-slate-500" title="Hỗ trợ khám online">
                <Video className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          {!compact && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="truncate text-xs text-slate-500">
                {d.clinic?.name && (
                  <>
                    <Building2 className="mr-1 inline h-3 w-3" />
                    {d.clinic.name}
                  </>
                )}
              </span>
              <span className="shrink-0 text-sm font-semibold text-slate-900">{vnd(d.consultationFee)}</span>
            </div>
          )}
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </Card>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20'

export function Btn({ children, variant = 'primary', className, loading, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'; loading?: boolean }) {
  const v = {
    primary: 'bg-teal-700 text-white hover:bg-teal-800 disabled:bg-teal-700/50',
    secondary: 'bg-teal-50 text-teal-800 hover:bg-teal-100',
    outline: 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
    ghost: 'text-slate-700 hover:bg-slate-100',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-600/50',
  }[variant]
  return (
    <button {...p} disabled={p.disabled || loading} className={cn('inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed', v, className)}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-sm transition', active ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300')}>
      {children}
    </button>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
