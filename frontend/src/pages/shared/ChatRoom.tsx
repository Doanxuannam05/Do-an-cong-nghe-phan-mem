import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, CheckCheck, Send, Video } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { errorMessage, get, post } from '@/lib/http'
import { useRealtime } from '@/lib/realtime'
import { time, day, vnDateKey } from '@/lib/format'
import { ErrorBox, PageHeader, Spinner, StatusBadge } from '@/components/kit'
import { cn } from '@/lib/utils'

interface Msg {
  id: number | string
  sender_id: number | null
  type: 'TEXT' | 'SYSTEM'
  content: string
  created_at: string
  pending?: boolean
}
interface Room {
  messages: Msg[]
  participants: { user_id: number; last_read_at: string | null; full_name: string; role: string; online: boolean }[]
  booking: { id: number; code: string; status: string; consultation_type: string }
}

export default function ChatRoom() {
  const { id } = useParams()
  const cid = Number(id)
  const { user } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const base = user?.role === 'DOCTOR' ? '/d' : '/p'
  const key = ['messages', cid]
  const q = useQuery({ queryKey: key, queryFn: () => get<Room>(`conversations/${cid}/messages`), staleTime: 60_000 })
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSent = useRef(0)
  const bottom = useRef<HTMLDivElement>(null)
  const lastRead = useRef(0)

  const other = q.data?.participants.find((p) => p.user_id !== user?.id)

  const markRead = () => {
    if (Date.now() - lastRead.current < 3000) return
    lastRead.current = Date.now()
    post(`conversations/${cid}/read`).then(() => qc.invalidateQueries({ queryKey: ['conversations'] })).catch(() => {})
  }
  useEffect(() => {
    if (q.data) markRead()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!q.data])

  useRealtime('NEW_MESSAGE', (e) => {
    if (e.conversationId !== cid) return
    qc.setQueryData<Room>(key, (old) => {
      if (!old || old.messages.some((m) => m.id === e.message.id)) return old
      const messages = old.messages.filter((m) => !(m.pending && m.content === e.message.content && e.message.sender_id === user?.id))
      return { ...old, messages: [...messages, e.message] }
    })
    if (e.message.sender_id !== user?.id) {
      setTyping(false)
      markRead()
    }
  })
  useRealtime('TYPING', (e) => {
    if (e.conversationId !== cid || e.userId === user?.id) return
    setTyping(true)
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => setTyping(false), 3500)
  })
  useRealtime('MESSAGE_READ', (e) => {
    if (e.conversationId !== cid) return
    qc.setQueryData<Room>(key, (old) => old && { ...old, participants: old.participants.map((p) => (p.user_id === e.userId ? { ...p, last_read_at: e.readAt } : p)) })
  })

  useLayoutEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [q.data?.messages.length, typing])

  const send = async () => {
    const content = text.trim()
    if (!content) return
    setText('')
    const temp: Msg = { id: -Date.now(), sender_id: user!.id, type: 'TEXT', content, created_at: new Date().toISOString(), pending: true }
    qc.setQueryData<Room>(key, (old) => old && { ...old, messages: [...old.messages, temp] })
    try {
      const m = await post<Msg>(`conversations/${cid}/messages`, { content })
      qc.setQueryData<Room>(key, (old) => old && { ...old, messages: old.messages.some((x) => x.id === m.id) ? old.messages.filter((x) => x.id !== temp.id) : old.messages.map((x) => (x.id === temp.id ? m : x)) })
      qc.invalidateQueries({ queryKey: ['conversations'] })
    } catch (e) {
      toast.error(errorMessage(e))
      qc.setQueryData<Room>(key, (old) => old && { ...old, messages: old.messages.filter((x) => x.id !== temp.id) })
      setText(content)
    }
  }
  const onType = (v: string) => {
    setText(v)
    if (Date.now() - lastTypingSent.current > 2500 && v) {
      lastTypingSent.current = Date.now()
      post(`conversations/${cid}/typing`).catch(() => {})
    }
  }

  if (q.isLoading) return <><PageHeader title="Tin nhắn" back /><Spinner /></>
  if (q.isError || !q.data) return <><PageHeader title="Tin nhắn" back /><div className="p-4"><ErrorBox message={errorMessage(q.error)} /></div></>

  const msgs = q.data.messages
  const lastMine = [...msgs].reverse().find((m) => m.sender_id === user?.id && !m.pending)
  const seen = lastMine && other?.last_read_at && new Date(other.last_read_at) >= new Date(lastMine.created_at)
  const canVideo = ['CONFIRMED', 'IN_PROGRESS'].includes(q.data.booking.status) && q.data.booking.consultation_type === 'ONLINE'

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col">
      <PageHeader
        title={`${other?.role === 'DOCTOR' ? 'BS. ' : ''}${other?.full_name || ''}`}
        subtitle={typing ? 'đang soạn tin…' : other?.online ? 'Đang trực tuyến' : `Lịch ${q.data.booking.code}`}
        back
        right={
          <div className="flex items-center gap-1">
            <button onClick={() => nav(`${base}/bookings/${q.data!.booking.id}`)}><StatusBadge status={q.data.booking.status} /></button>
            {canVideo && (
              <button aria-label="Gọi video" onClick={() => nav(`${base}/call/${q.data!.booking.id}`)} className="rounded-full p-2 text-teal-700 hover:bg-teal-50">
                <Video className="h-5 w-5" />
              </button>
            )}
          </div>
        }
      />
      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
        {msgs.map((m, i) => {
          const newDay = i === 0 || vnDateKey(m.created_at) !== vnDateKey(msgs[i - 1].created_at)
          const mine = m.sender_id === user?.id
          return (
            <div key={m.id}>
              {newDay && <p className="my-2 text-center text-xs text-slate-400">{day(m.created_at)}</p>}
              {m.type === 'SYSTEM' ? (
                <p className="mx-auto my-2 w-fit max-w-[85%] rounded-full bg-slate-200/70 px-3 py-1 text-center text-xs text-slate-600">{m.content}</p>
              ) : (
                <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[78%] rounded-2xl px-3 py-2 text-sm', mine ? 'rounded-br-md bg-teal-700 text-white' : 'rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200', m.pending && 'opacity-60')}>
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <p className={cn('mt-0.5 flex items-center justify-end gap-1 text-[10px]', mine ? 'text-teal-100' : 'text-slate-400')}>
                      {time(m.created_at)}
                      {mine && (m.pending ? null : m.id === lastMine?.id && seen ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {seen && <p className="pr-1 text-right text-[10px] text-slate-400">Đã xem</p>}
        {typing && <p className="text-xs italic text-slate-400">{other?.full_name} đang soạn tin…</p>}
        <div ref={bottom} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        className="flex items-end gap-2 border-t border-slate-200 bg-white p-3"
      >
        <textarea
          value={text}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Nhập tin nhắn…"
          className="max-h-28 flex-1 resize-none rounded-2xl bg-slate-100 px-4 py-2.5 text-sm outline-none"
        />
        <button type="submit" aria-label="Gửi" disabled={!text.trim()} className="rounded-full bg-teal-700 p-2.5 text-white disabled:opacity-40">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}
