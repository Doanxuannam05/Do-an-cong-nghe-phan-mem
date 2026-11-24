import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  api,
  getStoredSession,
  saveSession,
  Session,
  SessionUser,
} from '../services/api'
import { initApiConfig } from '../config'

interface AuthContextType {
  user: SessionUser | null
  session: Session | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  quickLogin: (role: 'PATIENT' | 'DOCTOR' | 'ADMIN') => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({} as any)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function init() {
      await initApiConfig()
      const s = await getStoredSession()
      if (s) {
        setSession(s)
      }
      setIsLoading(false)
    }
    init()
  }, [])

  const login = async (email: string, password: string) => {
    const res = await api.login({ email, password })
    const newSession: Session = {
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      user: res.user,
    }
    await saveSession(newSession)
    setSession(newSession)
  }

  const quickLogin = async (role: 'PATIENT' | 'DOCTOR' | 'ADMIN') => {
    let email = 'patient@demo.vn'
    if (role === 'DOCTOR') email = 'doctor@demo.vn'
    if (role === 'ADMIN') email = 'admin@demo.vn'
    await login(email, 'Demo@123')
  }

  const logout = async () => {
    await saveSession(null)
    setSession(null)
  }

  const refreshUser = async () => {
    try {
      const u = await api.getMe()
      if (session) {
        const updated = { ...session, user: u }
        await saveSession(updated)
        setSession(updated)
      }
    } catch {
      // ignore
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user || null,
        session,
        isLoading,
        login,
        quickLogin,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
