import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bell, Building2, CalendarDays, ClipboardList, CreditCard, FlaskConical, Home, LayoutDashboard, LogOut, Map, MessageCircle, MessageSquareWarning, Activity, Star, Stethoscope, UserRound, Users, Inbox,
} from 'lucide-react'
import { useAuth, homeFor } from '@/lib/auth'
import { get } from '@/lib/http'
import { useRealtimeStatus } from '@/lib/realtime'
import { cn } from '@/lib/utils'
import IncomingCall from './IncomingCall'

type Role = 'PATIENT' | 'DOCTOR' | 'ADMIN'

/** Chặn truy cập theo vai trò (RBAC phía giao diện – API cũng kiểm tra lại) */
export function RequireRole({ role, children }: { role: Role; children: React.ReactNode }) {
  const { user } = useAuth()
  const loc = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />
  return <>{children}</>
}

export function useUnread() {
  const { user } = useAuth()
  const n = useQuery({ queryKey: ['notifications'], queryFn: () => get<{ items: unknown[]; unread: number }>('notifications'), enabled: !!user, staleTime: 60_000 })
  const c = useQuery({ queryKey: ['conversations'], queryFn: () => get<{ unread: number }[]>('conversations'), enabled: !!user && user.role !== 'ADMIN', staleTime: 60_000 })
  return { notifications: n.data?.unread || 0, messages: (c.data || []).reduce((s, x) => s + (x.unread || 0), 0) }
}

const PATIENT_NAV = [
  { to: '/p', icon: Home, label: 'Trang chủ', end: true },
  { to: '/p/search', icon: Map, label: 'Bản đồ' },
  { to: '/p/bookings', icon: CalendarDays, label: 'Lịch khám' },
  { to: '/p/chats', icon: MessageCircle, label: 'Tin nhắn', badge: 'messages' as const },
  { to: '/p/profile', icon: UserRound, label: 'Tài khoản' },
]
const DOCTOR_NAV = [
  { to: '/d', icon: Home, label: 'Trang chủ', end: true },
  { to: '/d/requests', icon: Inbox, label: 'Yêu cầu' },
  { to: '/d/schedule', icon: CalendarDays, label: 'Lịch' },
  { to: '/d/chats', icon: MessageCircle, label: 'Tin nhắn', badge: 'messages' as const },
  { to: '/d/profile', icon: UserRound, label: 'Tài khoản' },
]

/** Khung ứng dụng di động (mobile-first) cho Patient và Doctor */
export function MobileShell({ role, children }: { role: 'PATIENT' | 'DOCTOR'; children?: React.ReactNode }) {
  const nav = role === 'PATIENT' ? PATIENT_NAV : DOCTOR_NAV
  const unread = useUnread()
  const loc = useLocation()
  const hideNav = /\/call\//.test(loc.pathname)
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col bg-slate-50 shadow-[0_0_0_1px_rgba(15,23,42,0.04)]">
        <main className={cn('flex-1', !hideNav && 'pb-20')}>{children || <Outlet />}</main>
        {!hideNav && (
          <nav className="fixed bottom-0 left-1/2 z-30 grid w-full max-w-md -translate-x-1/2 grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-teal-700' : 'text-slate-500')}>
                <n.icon className="h-5 w-5" />
                {n.label}
                {n.badge && unread[n.badge] > 0 && <span className="absolute right-[22%] top-1 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] leading-4 text-white">{unread[n.badge]}</span>}
              </NavLink>
            ))}
          </nav>
        )}
        <IncomingCall />
      </div>
    </div>
  )
}

/** Nút chuông + chấm kết nối real-time cho header */
export function HeaderActions({ notificationsPath }: { notificationsPath: string }) {
  const unread = useUnread()
  const connected = useRealtimeStatus()
  const nav = useNavigate()
  return (
    <div className="flex items-center gap-1">
      <span title={connected ? 'Đã kết nối thời gian thực' : 'Đang kết nối lại…'} className={cn('mr-1 h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-amber-400')} />
      <button aria-label="Thông báo" onClick={() => nav(notificationsPath)} className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100">
        <Bell className="h-5 w-5" />
        {unread.notifications > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] leading-4 text-white">{unread.notifications > 9 ? '9+' : unread.notifications}</span>}
      </button>
    </div>
  )
}

const ADMIN_NAV = [
  { to: '/a', icon: LayoutDashboard, label: 'Tổng quan', end: true },
  { to: '/a/doctors', icon: Stethoscope, label: 'Bác sĩ & duyệt hồ sơ' },
  { to: '/a/users', icon: Users, label: 'Người dùng' },
  { to: '/a/bookings', icon: ClipboardList, label: 'Yêu cầu & lịch khám' },
  { to: '/a/payments', icon: CreditCard, label: 'Thanh toán' },
  { to: '/a/reviews', icon: Star, label: 'Đánh giá' },
  { to: '/a/complaints', icon: MessageSquareWarning, label: 'Khiếu nại' },
  { to: '/a/catalog', icon: Building2, label: 'Chuyên khoa & phòng khám' },
  { to: '/a/lab', icon: FlaskConical, label: 'Thực nghiệm NCKH' },
  { to: '/a/system', icon: Activity, label: 'Giám sát hệ thống' },
]

/** Khung Admin Web Dashboard */
export function AdminShell() {
  const { user, logout } = useAuth()
  const connected = useRealtimeStatus()
  const nav = useNavigate()
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white">
            <Stethoscope className="h-4 w-4" />
          </span>
          <div>
            <p className="font-semibold text-slate-900">MediGo Admin</p>
            <p className="text-xs text-slate-500">Đà Nẵng · dữ liệu mô phỏng</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {ADMIN_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm', isActive ? 'bg-teal-50 font-semibold text-teal-800' : 'text-slate-600 hover:bg-slate-50')}>
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-4">
          <p className="truncate text-sm font-medium text-slate-800">{user?.fullName}</p>
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-emerald-500' : 'bg-amber-400')} />
            {connected ? 'Real-time đang kết nối' : 'Đang kết nối lại…'}
          </p>
          <button
            onClick={async () => {
              await logout()
              nav('/login')
            }}
            className="mt-3 flex items-center gap-2 text-sm text-slate-600 hover:text-rose-700"
          >
            <LogOut className="h-4 w-4" /> Đăng xuất
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 lg:hidden">
          {ADMIN_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs', isActive ? 'bg-teal-50 font-semibold text-teal-800' : 'text-slate-600')}>
              <n.icon className="h-3.5 w-3.5" />
              {n.label}
            </NavLink>
          ))}
        </div>
        <Outlet />
      </div>
    </div>
  )
}

export function AdminPage({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

