import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { get } from '@/lib/http'
import { relative } from '@/lib/format'
import { Avatar, Empty, ErrorBox, PageHeader, Spinner, StatusBadge } from '@/components/kit'

export interface ConversationRow {
  id: number
  booking_id: number
  code: string
  booking_status: string
  last_message_at: string | null
  other_user_id: number
  other_name: string
  other_role: string
  other_avatar: string | null
  other_online: boolean
  last_message: { content: string; type: string; sender_id: number | null; created_at: string } | null
  unread: number
}

export default function Chats() {
  const { user } = useAuth()
  const nav = useNavigate()
  const base = user?.role === 'DOCTOR' ? '/d' : '/p'
  const q = useQuery({ queryKey: ['conversations'], queryFn: () => get<ConversationRow[]>('conversations'), staleTime: 30_000 })

  return (
    <div>
      <PageHeader title="Tin nhắn" subtitle="Mỗi cuộc trò chuyện gắn với một lịch khám đã xác nhận" />
      <div className="p-2">
        {q.isLoading ? (
          <Spinner />
        ) : q.isError ? (
          <div className="p-2"><ErrorBox message="Không tải được tin nhắn." onRetry={() => q.refetch()} /></div>
        ) : !q.data?.length ? (
          <div className="p-2"><Empty title="Chưa có cuộc trò chuyện" hint="Phòng chat được mở khi bác sĩ nhận lịch khám." /></div>
        ) : (
          q.data.map((c) => (
            <button key={c.id} onClick={() => nav(`${base}/chats/${c.id}`)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-white">
              <div className="relative">
                <Avatar src={c.other_avatar} doctor={c.other_role === 'DOCTOR'} size={48} />
                {c.other_online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-slate-50" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold text-slate-900">{c.other_role === 'DOCTOR' ? 'BS. ' : ''}{c.other_name}</p>
                  <span className="shrink-0 text-xs text-slate-400">{relative(c.last_message?.created_at || c.last_message_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className={`truncate text-sm ${c.unread ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                    {c.last_message ? `${c.last_message.sender_id === user?.id ? 'Bạn: ' : ''}${c.last_message.content}` : 'Chưa có tin nhắn'}
                  </p>
                  {c.unread > 0 && <span className="shrink-0 rounded-full bg-teal-700 px-1.5 text-xs text-white">{c.unread}</span>}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                  {c.code} <StatusBadge status={c.booking_status} className="scale-90" />
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
