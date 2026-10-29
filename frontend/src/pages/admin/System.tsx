import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { get, errorMessage } from '@/lib/http'
import { time } from '@/lib/format'
import { AdminPage } from '@/components/layouts'
import { Btn, Card, ErrorBox, Spinner } from '@/components/kit'
import { cn } from '@/lib/utils'
import { CardTitle, num } from './shared'

interface StorageInfo {
  tables: Record<string, number>
  pending: Record<string, number>
  batch: { flushes: number; rows: number; failures: number; lastError: string | null }
}
interface ApiInfo {
  windowHours: number
  count: number
  avgMs: number | null
  p95Ms: number | null
  serverErrors: number
  slowest: { route: string; count: number; avgMs: number | null; p95Ms: number | null; maxMs: number }[]
}
const TABLE_LABEL: Record<string, string> = {
  conversations: 'Phòng chat', messages: 'Tin nhắn', notifications: 'Thông báo', doctor_locations: 'Lịch sử vị trí bác sĩ',
  dispatch_events: 'Nhật ký điều phối', experiment_runs: 'Kết quả thực nghiệm', api_metrics: 'Số đo thời gian API',
}

interface SystemInfo {
  storage?: StorageInfo
  api?: ApiInfo | null
  db: { queries: number; avgMs: number | null; recentAvgMs: number | null; maxMs: number | null; lastMinute: number; budgetPerMinute: number; retries: number }
  realtime: { connectedUsers: number; samples: number; avgMs: number | null; maxMs?: number }
  dispatch: { activeContexts: number; timeoutSec: number }
  directory: { doctors: number }
  uptimeSec: number
  memoryMb: number
}

function uptime(sec: number) {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d) return `${d} ngày ${h} giờ`
  if (h) return `${h} giờ ${m} phút`
  return `${m} phút ${sec % 60} giây`
}
const ms = (v?: number | null) => (v == null ? '—' : `${num(v, v < 10 ? 1 : 0)} ms`)

export default function SystemPage() {
  const q = useQuery({
    queryKey: ['admin', 'system'],
    queryFn: () => get<SystemInfo>('admin/system'),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
  const s = q.data

  return (
    <AdminPage
      title="Giám sát hệ thống"
      subtitle={q.dataUpdatedAt ? `Cập nhật lúc ${time(new Date(q.dataUpdatedAt).toISOString())} · tự làm mới mỗi 30 giây` : 'Tự làm mới mỗi 30 giây'}
      actions={
        <Btn variant="outline" onClick={() => q.refetch()} loading={q.isFetching}>
          {!q.isFetching && <RefreshCw className="h-4 w-4" />} Làm mới
        </Btn>
      }
    >
      {q.isLoading && <Spinner />}
      {q.error && <ErrorBox message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {s && <Body s={s} />}
    </AdminPage>
  )
}

function Body({ s }: { s: SystemInfo }) {
  const used = s.db.budgetPerMinute ? s.db.lastMinute / s.db.budgetPerMinute : 0
  const tone = used >= 0.9 ? 'bad' : used >= 0.7 ? 'warn' : 'good'
  return (
    <div className="space-y-4">
      <Card>
        <CardTitle hint="Số truy vấn trong 60 giây gần nhất so với hạn mức của proxy cơ sở dữ liệu">Hạn mức truy vấn cơ sở dữ liệu</CardTitle>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums text-slate-900">{s.db.lastMinute}</span>
          <span className="text-sm text-slate-500">/ {s.db.budgetPerMinute} truy vấn mỗi phút</span>
          <span className={cn('ml-auto text-sm font-medium', tone === 'bad' ? 'text-rose-700' : tone === 'warn' ? 'text-amber-700' : 'text-emerald-700')}>
            {tone === 'bad' ? 'Sắp chạm hạn mức' : tone === 'warn' ? 'Đang dùng nhiều' : 'Bình thường'}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={cn('h-full rounded-full', tone === 'bad' ? 'bg-rose-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.min(100, used * 100)}%` }} />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Group title="PostgreSQL – truy vấn" hint="Toàn bộ dữ liệu nằm trong một cơ sở dữ liệu PostgreSQL · tính từ khi máy chủ khởi động">
          <Row label="Tổng số truy vấn" value={num(s.db.queries)} />
          <Row label="Thời gian truy vấn TB" value={ms(s.db.avgMs)} />
          <Row label="TB các truy vấn gần đây" value={ms(s.db.recentAvgMs)} />
          <Row label="Truy vấn chậm nhất" value={ms(s.db.maxMs)} />
          <Row label="Số lần thử lại" value={num(s.db.retries)} warn={s.db.retries > 0} />
        </Group>
        <Group title="Thời gian thực (SSE)" hint="Kết nối luồng sự kiện và độ trễ đo được">
          <Row label="Người dùng đang kết nối" value={num(s.realtime.connectedUsers)} />
          <Row label="Độ trễ TB" value={ms(s.realtime.avgMs)} />
          <Row label="Độ trễ lớn nhất" value={ms(s.realtime.maxMs)} />
          <Row label="Số mẫu đo" value={num(s.realtime.samples)} />
        </Group>
        {s.storage && (
          <Group title="Dữ liệu ghi nhiều" hint="Số bản ghi các bảng; thông báo, nhật ký điều phối, vị trí và số đo API được ghi theo lô">
            {Object.entries(s.storage.tables).map(([k, v]) => (
              <Row key={k} label={`${TABLE_LABEL[k] || k} · ${k}`} value={num(v)} />
            ))}
            <Row label="Bản ghi đang chờ ghi theo lô" value={num(Object.values(s.storage.pending).reduce((a, b) => a + b, 0))} />
            <Row label="Số lần ghi lô / số bản ghi" value={`${num(s.storage.batch.flushes)} / ${num(s.storage.batch.rows)}`} />
            <Row label="Lần ghi lô thất bại" value={num(s.storage.batch.failures)} warn={s.storage.batch.failures > 0} />
            {s.storage.batch.lastError && <p className="py-2 text-xs text-amber-700">{s.storage.batch.lastError}</p>}
          </Group>
        )}
        <Group title="Điều phối và máy chủ">
          <Row label="Phiên điều phối đang chạy" value={num(s.dispatch.activeContexts)} />
          <Row label="Thời gian chờ bác sĩ phản hồi" value={`${s.dispatch.timeoutSec} s`} />
          <Row label="Bác sĩ trong bộ nhớ đệm" value={num(s.directory.doctors)} />
          <Row label="Thời gian hoạt động" value={uptime(s.uptimeSec)} />
          <Row label="Bộ nhớ (RSS)" value={`${num(s.memoryMb)} MB`} />
        </Group>
      </div>
      {s.api && (
        <Card className="mt-4">
          <CardTitle hint={`${s.api.windowHours} giờ qua · bảng api_metrics · mục tiêu < 500 ms`}>Thời gian phản hồi API</CardTitle>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Mini label="Số request" value={num(s.api.count)} />
            <Mini label="Trung bình" value={ms(s.api.avgMs)} />
            <Mini label="P95" value={ms(s.api.p95Ms)} />
            <Mini label="Lỗi máy chủ (5xx)" value={num(s.api.serverErrors)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-2 pr-3 font-medium">API chậm nhất</th>
                  <th className="pr-3 text-right font-medium">Số lần</th>
                  <th className="pr-3 text-right font-medium">TB</th>
                  <th className="pr-3 text-right font-medium">P95</th>
                  <th className="text-right font-medium">Tối đa</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {s.api.slowest.map((r) => (
                  <tr key={r.route} className="border-b border-slate-50">
                    <td className="py-1.5 pr-3 font-mono text-xs text-slate-700">{r.route}</td>
                    <td className="pr-3 text-right">{num(r.count)}</td>
                    <td className={cn('pr-3 text-right', (r.avgMs || 0) > 500 && 'font-semibold text-amber-700')}>{ms(r.avgMs)}</td>
                    <td className="pr-3 text-right">{ms(r.p95Ms)}</td>
                    <td className="text-right">{ms(r.maxMs)}</td>
                  </tr>
                ))}
                {!s.api.slowest.length && (
                  <tr><td colSpan={5} className="py-3 text-slate-500">Chưa có dữ liệu.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  )
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardTitle hint={hint}>{title}</CardTitle>
      <dl className="divide-y divide-slate-100">{children}</dl>
    </Card>
  )
}
function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <dt className="text-slate-600">{label}</dt>
      <dd className={cn('font-semibold tabular-nums', warn ? 'text-amber-700' : 'text-slate-900')}>{value}</dd>
    </div>
  )
}
