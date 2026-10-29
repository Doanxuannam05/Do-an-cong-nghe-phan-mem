import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { get, post } from '@/lib/http'
import { relative } from '@/lib/format'
import { Empty, ErrorBox, PageHeader, Spinner } from '@/components/kit'
import { cn } from '@/lib/utils'

interface N {
  id: string
  type: string
  title: string
  body: string | null
  data: { bookingId?: number; conversationId?: number } | null
  read_at: string | null
  created_at: string
}

export default function Notifications() {
  const { user } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const base = user?.role === 'DOCTOR' ? '/d' : '/p'
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => get<{ items: N[]; unread: number }>('notifications'), staleTime: 30_000 })
  const readAll = useMutation({ mutationFn: () => post('notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) })

  const open = (n: N) => {
    if (!n.read_at) post(`notifications/${n.id}/read`).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })).catch(() => {})
    if (n.data?.conversationId) nav(`${base}/chats/${n.data.conversationId}`)
    else if (n.data?.bookingId) nav(`${base}/bookings/${n.data.bookingId}`)
    else if (n.type === 'NEW_BOOKING_REQUEST' && user?.role === 'DOCTOR') nav('/d/requests')
  }

  return (
    <div>
      <PageHeader
        title="Thông báo"
        back
        right={q.data?.unread ? <button onClick={() => readAll.mutate()} className="text-xs font-semibold text-teal-700">Đánh dấu đã đọc</button> : null}
      />
      <div className="p-2">
        {q.isLoading ? (
          <Spinner />
        ) : q.isError ? (
          <ErrorBox message="Không tải được thông báo." onRetry={() => q.refetch()} />
        ) : !q.data?.items.length ? (
          <div className="p-2"><Empty title="Chưa có thông báo" /></div>
        ) : (
          q.data.items.map((n) => (
            <button key={n.id} onClick={() => open(n)} className={cn('flex w-full gap-3 rounded-2xl px-3 py-3 text-left hover:bg-white', !n.read_at && 'bg-teal-50/50')}>
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-teal-600')} />
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm', n.read_at ? 'text-slate-700' : 'font-semibold text-slate-900')}>{n.title}</p>
                {n.body && <p className="line-clamp-2 text-sm text-slate-500">{n.body}</p>}
                <p className="mt-0.5 text-xs text-slate-400">{relative(n.created_at)}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
