import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { http, loadSession, saveSession, type Session, type SessionUser } from './http'

interface AuthCtx {
  session: Session | null
  user: SessionUser | null
  login: (email: string, password: string) => Promise<SessionUser>
  register: (body: Record<string, unknown>) => Promise<SessionUser>
  logout: () => Promise<void>
  refreshMe: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const qc = useQueryClient()

  useEffect(() => {
    const on = () => setSession(loadSession())
    window.addEventListener('medigo:session', on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener('medigo:session', on)
      window.removeEventListener('storage', on)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const r = await http<Session>('auth/login', { method: 'POST', json: { email, password } })
    qc.clear()
    saveSession(r)
    return r.user
  }, [qc])

  const register = useCallback(async (body: Record<string, unknown>) => {
    const r = await http<Session>('auth/register', { method: 'POST', json: body })
    qc.clear()
    saveSession(r)
    return r.user
  }, [qc])

  const logout = useCallback(async () => {
    const s = loadSession()
    try {
      if (s) await http('auth/logout', { method: 'POST', json: { refreshToken: s.refreshToken } })
    } catch {
      /* bỏ qua */
    }
    saveSession(null)
    qc.clear()
  }, [qc])

  const refreshMe = useCallback(async () => {
    const r = await http<{ user: SessionUser }>('auth/me')
    const s = loadSession()
    if (s) saveSession({ ...s, user: r.user })
  }, [])

  const value = useMemo(() => ({ session, user: session?.user ?? null, login, register, logout, refreshMe }), [session, login, register, logout, refreshMe])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth must be used inside AuthProvider')
  return c
}

export const homeFor = (role?: string) => (role === 'DOCTOR' ? '/d' : role === 'ADMIN' ? '/a' : '/p')
