import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider, homeFor, useAuth } from '@/lib/auth'
import { RealtimeProvider } from '@/lib/realtime'
import { AdminShell, MobileShell, RequireRole } from '@/components/layouts'
import IncomingOffer from '@/components/IncomingOffer'

import Login from '@/pages/auth/Login'
import Register from '@/pages/auth/Register'
import Forgot from '@/pages/auth/Forgot'

import PatientHome from '@/pages/patient/Home'
import PatientSearch from '@/pages/patient/Search'
import DoctorDetail from '@/pages/patient/DoctorDetail'
import RequestNow from '@/pages/patient/Request'
import PatientBookings from '@/pages/patient/Bookings'
import PatientProfile from '@/pages/patient/Profile'
import Symptom from '@/pages/patient/Symptom'

import BookingDetail from '@/pages/shared/BookingDetail'
import Chats from '@/pages/shared/Chats'
import ChatRoom from '@/pages/shared/ChatRoom'
import VideoCall from '@/pages/shared/VideoCall'
import Notifications from '@/pages/shared/Notifications'

import DoctorHome from '@/pages/doctor/Home'
import DoctorRequests from '@/pages/doctor/Requests'
import DoctorSchedule from '@/pages/doctor/Schedule'
import DoctorBookings from '@/pages/doctor/Bookings'
import DoctorStats from '@/pages/doctor/Stats'
import DoctorProfile from '@/pages/doctor/Profile'

import AdminDashboard from '@/pages/admin/Dashboard'
import AdminDoctors from '@/pages/admin/Doctors'
import AdminUsers from '@/pages/admin/Users'
import AdminBookings from '@/pages/admin/Bookings'
import AdminPayments from '@/pages/admin/Payments'
import AdminReviews from '@/pages/admin/Reviews'
import AdminComplaints from '@/pages/admin/Complaints'
import AdminCatalog from '@/pages/admin/Catalog'
import AdminLab from '@/pages/admin/Lab'
import AdminSystem from '@/pages/admin/System'

/** Giao diện sáng – phong cách y tế tối giản; font hỗ trợ đầy đủ tiếng Việt */
function useHealthcareTheme() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('dark')
    root.lang = 'vi'
    const vars: Record<string, string> = {
      '--primary': '#0f766e', '--primary-foreground': '#ffffff', '--ring': '#0f766e', '--background': '#f8fafc', '--foreground': '#0f172a',
      '--radius': '0.75rem',
    }
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
    if (!document.getElementById('mg-font')) {
      const l = document.createElement('link')
      l.id = 'mg-font'
      l.rel = 'stylesheet'
      l.href = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap'
      document.head.appendChild(l)
    }
    document.body.style.fontFamily = "'Be Vietnam Pro', system-ui, sans-serif"
    document.body.style.background = '#f1f5f9'
    document.title = 'MediGo – Kết nối người bệnh với bác sĩ'
  }, [])
}

function RootRedirect() {
  const { user } = useAuth()
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />
}

function PatientArea({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="PATIENT">
      <MobileShell role="PATIENT">{children}</MobileShell>
    </RequireRole>
  )
}
function DoctorArea({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="DOCTOR">
      <MobileShell role="DOCTOR">
        {children}
        <IncomingOffer />
      </MobileShell>
    </RequireRole>
  )
}

export default function App() {
  useHealthcareTheme()
  return (
    <AuthProvider>
      <RealtimeProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot" element={<Forgot />} />

            <Route path="/p" element={<PatientArea><PatientHome /></PatientArea>} />
            <Route path="/p/search" element={<PatientArea><PatientSearch /></PatientArea>} />
            <Route path="/p/ai" element={<PatientArea><Symptom /></PatientArea>} />
            <Route path="/p/doctors/:id" element={<PatientArea><DoctorDetail /></PatientArea>} />
            <Route path="/p/request" element={<PatientArea><RequestNow /></PatientArea>} />
            <Route path="/p/bookings" element={<PatientArea><PatientBookings /></PatientArea>} />
            <Route path="/p/bookings/:id" element={<PatientArea><BookingDetail /></PatientArea>} />
            <Route path="/p/chats" element={<PatientArea><Chats /></PatientArea>} />
            <Route path="/p/chats/:id" element={<PatientArea><ChatRoom /></PatientArea>} />
            <Route path="/p/call/:bookingId" element={<PatientArea><VideoCall /></PatientArea>} />
            <Route path="/p/notifications" element={<PatientArea><Notifications /></PatientArea>} />
            <Route path="/p/profile" element={<PatientArea><PatientProfile /></PatientArea>} />

            <Route path="/d" element={<DoctorArea><DoctorHome /></DoctorArea>} />
            <Route path="/d/requests" element={<DoctorArea><DoctorRequests /></DoctorArea>} />
            <Route path="/d/schedule" element={<DoctorArea><DoctorSchedule /></DoctorArea>} />
            <Route path="/d/bookings" element={<DoctorArea><DoctorBookings /></DoctorArea>} />
            <Route path="/d/bookings/:id" element={<DoctorArea><BookingDetail /></DoctorArea>} />
            <Route path="/d/chats" element={<DoctorArea><Chats /></DoctorArea>} />
            <Route path="/d/chats/:id" element={<DoctorArea><ChatRoom /></DoctorArea>} />
            <Route path="/d/call/:bookingId" element={<DoctorArea><VideoCall /></DoctorArea>} />
            <Route path="/d/notifications" element={<DoctorArea><Notifications /></DoctorArea>} />
            <Route path="/d/stats" element={<DoctorArea><DoctorStats /></DoctorArea>} />
            <Route path="/d/profile" element={<DoctorArea><DoctorProfile /></DoctorArea>} />

            <Route path="/a" element={<RequireRole role="ADMIN"><AdminShell /></RequireRole>}>
              <Route index element={<AdminDashboard />} />
              <Route path="doctors" element={<AdminDoctors />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="bookings" element={<AdminBookings />} />
              <Route path="bookings/:id" element={<div className="mx-auto max-w-md"><BookingDetail /></div>} />
              <Route path="payments" element={<AdminPayments />} />
              <Route path="reviews" element={<AdminReviews />} />
              <Route path="complaints" element={<AdminComplaints />} />
              <Route path="catalog" element={<AdminCatalog />} />
              <Route path="lab" element={<AdminLab />} />
              <Route path="system" element={<AdminSystem />} />
            </Route>
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </HashRouter>
        <Toaster position="top-center" richColors closeButton />
      </RealtimeProvider>
    </AuthProvider>
  )
}
