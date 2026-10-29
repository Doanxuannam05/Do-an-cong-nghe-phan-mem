import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { get, errorMessage } from '@/lib/http'
import { BTYPE, dateTime, pct, vnd, km } from '@/lib/format'
import { AdminPage } from '@/components/layouts'
import { Btn, Card, Empty, ErrorBox, Spinner, Stat, StatusBadge, RatingInline } from '@/components/kit'
import { Chart, CardTitle, PALETTE, STATUS_COLOR, TableWrap, cartesian, num, td, th } from './shared'

interface Stats {
  totals: {
    patients: number; doctors: number; pendingDoctors: number; onlineDoctors: number; availableDoctors: number; busyDoctors: number
    bookings: number; completed: number; cancelled: number; active: number; revenue: number; revenue30d: number
    avgRating: number | null; totalReviews: number; openComplaints: number; successRate: number | null
  }
  byStatus: Record<string, number>
  byType: Record<string, number>
  byDay: { day: string; total: number; completed: number; cancelled: number; failed: number; on_demand: number }[]
  usersByMonth: { month: string; patients: number; doctors: number }[]
  bySpecialty: { name: string; n: number; completed: number }[]
  dispatch: {
    avgMatchingMs: number | null; avgTimeToAcceptSec: number | null; avgDistanceKm: number | null; onDemand: number; matched: number; noDoctor: number
    offers: number; accepted: number; rejected: number; expired: number; avgResponseMs: number | null; acceptanceRate: number | null
  }
  doctorActivity: { online: number; busy: number; offline: number; available: number }
  topDoctors: { id: number; full_name: string; completed: number; rating: number | null }[]
  recent: { id: number; code: string; type: string; status: string; created_at: string; specialty: string | null; patient_name: string; doctor_name: string | null }[]
  queryMs: number
}

const shortDay = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const monthLabel = (s: string) => `T${Number(s.slice(5, 7))}/${s.slice(2, 4)}`

export default function DashboardPage() {
  const nav = useNavigate()
  const q = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => get<Stats>('admin/stats'), staleTime: 60_000 })
  const s = q.data

  return (
    <AdminPage
      title="Tổng quan hệ thống"
      subtitle={s ? `Số liệu 30 ngày gần nhất · truy vấn ${s.queryMs} ms` : 'Số liệu 30 ngày gần nhất'}
      actions={
        <Btn variant="outline" onClick={() => q.refetch()} loading={q.isFetching}>
          {!q.isFetching && <RefreshCw className="h-4 w-4" />} Làm mới
        </Btn>
      }
    >
      {q.isLoading && <Spinner />}
      {q.error && <ErrorBox message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {s && <DashboardBody s={s} onOpen={(id) => nav(`/a/bookings/${id}`)} />}
    </AdminPage>
  )
}

function DashboardBody({ s, onOpen }: { s: Stats; onOpen: (id: number) => void }) {
  const t = s.totals
  const d = s.dispatch
  const days = s.byDay.map((x) => shortDay(x.day))
  const other = s.byDay.map((x) => Math.max(0, x.total - x.completed - x.cancelled - x.failed))
  const dailySuccess = s.byDay.map((x) => {
    const fin = x.completed + x.cancelled + x.failed
    return fin ? x.completed / fin : null
  })
  const act = s.doctorActivity
  const spec = s.bySpecialty.slice(0, 10)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Bệnh nhân" value={num(t.patients)} />
        <Stat label="Bác sĩ đã duyệt" value={num(t.doctors)} hint={t.pendingDoctors ? `${t.pendingDoctors} hồ sơ chờ duyệt` : 'Không có hồ sơ chờ duyệt'} />
        <Stat label="Bác sĩ đang online" value={num(t.onlineDoctors)} hint={`${t.availableDoctors} sẵn sàng · ${t.busyDoctors} đang khám`} />
        <Stat label="Tổng lượt đặt khám" value={num(t.bookings)} hint={`${t.active} đang xử lý · ${s.byType.ON_DEMAND || 0} khám ngay`} />
        <Stat label="Tỷ lệ hoàn thành" value={pct(t.successRate)} hint="Trên các yêu cầu đã kết thúc" />
        <Stat label="Doanh thu" value={vnd(t.revenue)} hint={`30 ngày: ${vnd(t.revenue30d)}`} />
        <Stat label="Đánh giá trung bình" value={t.avgRating != null ? `${t.avgRating.toFixed(2)} / 5` : '—'} hint={`${num(t.totalReviews)} đánh giá`} />
        <Stat label="Khiếu nại chưa xử lý" value={num(t.openComplaints)} hint={t.openComplaints ? 'Mới hoặc đang xử lý' : 'Đã xử lý hết'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="min-w-0 lg:col-span-2">
          <CardTitle hint="Phân theo kết quả của yêu cầu">Lượt đặt khám theo ngày</CardTitle>
          <Chart
            height={260}
            option={cartesian({
              categories: days,
              barMaxWidth: 14,
              series: [
                { name: 'Hoàn thành', data: s.byDay.map((x) => x.completed), color: STATUS_COLOR.good, stack: 'a' },
                { name: 'Đang xử lý', data: other, color: STATUS_COLOR.info, stack: 'a' },
                { name: 'Đã hủy', data: s.byDay.map((x) => x.cancelled), color: STATUS_COLOR.neutral, stack: 'a' },
                { name: 'Thất bại', data: s.byDay.map((x) => x.failed), color: STATUS_COLOR.bad, stack: 'a' },
              ],
            })}
          />
        </Card>
        <Card>
          <CardTitle hint="Hoàn thành / (hoàn thành + hủy + thất bại)">Tỷ lệ thành công theo ngày</CardTitle>
          <Chart
            height={260}
            option={cartesian({
              categories: days,
              yMin: 0,
              yMax: 1,
              fmt: (v) => pct(v),
              axisFmt: (v) => `${Math.round(v * 100)}%`,
              series: [{ name: 'Tỷ lệ thành công', data: dailySuccess, color: PALETTE[0], type: 'line', area: true }],
            })}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <CardTitle hint="Tài khoản mới đăng ký, 6 tháng gần nhất">Người dùng mới theo tháng</CardTitle>
          <Chart
            height={240}
            option={cartesian({
              categories: s.usersByMonth.map((x) => monthLabel(x.month)),
              series: [
                { name: 'Bệnh nhân', data: s.usersByMonth.map((x) => x.patients), color: PALETTE[0] },
                { name: 'Bác sĩ', data: s.usersByMonth.map((x) => x.doctors), color: PALETTE[1] },
              ],
            })}
          />
        </Card>
        <Card>
          <CardTitle hint={`${t.doctors} bác sĩ đã duyệt, trạng thái hiện tại`}>Hoạt động bác sĩ</CardTitle>
          <Chart
            height={240}
            option={cartesian({
              categories: ['Sẵn sàng nhận ca', 'Online, tạm ngưng', 'Đang khám', 'Offline'],
              barMaxWidth: 24,
              series: [
                {
                  name: 'Bác sĩ',
                  color: STATUS_COLOR.good,
                  data: [
                    { value: act.available, itemStyle: { color: STATUS_COLOR.good } },
                    { value: Math.max(0, act.online - act.available), itemStyle: { color: STATUS_COLOR.warn } },
                    { value: act.busy, itemStyle: { color: '#7c3aed' } },
                    { value: act.offline, itemStyle: { color: STATUS_COLOR.neutral } },
                  ],
                },
              ],
            })}
          />
        </Card>
        <Card>
          <CardTitle hint="30 ngày gần nhất">Lượt đặt theo chuyên khoa</CardTitle>
          {spec.length ? (
            <Chart
              height={240}
              option={cartesian({
                categories: spec.map((x) => x.name),
                horizontal: true,
                barMaxWidth: 10,
                grid: { right: 16 },
                series: [
                  { name: 'Tổng yêu cầu', data: spec.map((x) => x.n), color: PALETTE[1] },
                  { name: 'Hoàn thành', data: spec.map((x) => x.completed), color: PALETTE[0] },
                ],
              })}
            />
          ) : (
            <Empty title="Chưa có dữ liệu" />
          )}
        </Card>
      </div>

      <Card>
        <CardTitle hint="Chỉ tính yêu cầu khám ngay (ON_DEMAND) đi qua Matching Engine">Điều phối và ghép cặp</CardTitle>
        <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          <div className="grid grid-cols-2 gap-3 lg:col-span-2 md:grid-cols-3">
            <Metric label="Thời gian ghép cặp TB" value={d.avgMatchingMs != null ? `${d.avgMatchingMs.toFixed(2)} ms` : '—'} />
            <Metric label="Thời gian đến khi được nhận" value={d.avgTimeToAcceptSec != null ? `${d.avgTimeToAcceptSec.toFixed(1)} s` : '—'} />
            <Metric label="Tỷ lệ chấp nhận lời mời" value={pct(d.acceptanceRate)} hint={`${num(d.accepted)} / ${num(d.offers)} lời mời`} />
            <Metric label="Khoảng cách TB" value={km(d.avgDistanceKm)} />
            <Metric label="Đã ghép được bác sĩ" value={`${num(d.matched)} / ${num(d.onDemand)}`} hint={d.onDemand ? pct(d.matched / d.onDemand) : undefined} />
            <Metric label="Không tìm được bác sĩ" value={num(d.noDoctor)} hint={d.avgResponseMs != null ? `Bác sĩ phản hồi TB ${(d.avgResponseMs / 1000).toFixed(1)} s` : undefined} />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Kết quả lời mời gửi bác sĩ</p>
            <Chart
              height={200}
              option={cartesian({
                categories: ['Chấp nhận', 'Từ chối', 'Hết hạn (30 s)'],
                barMaxWidth: 24,
                series: [
                  {
                    name: 'Lời mời',
                    color: STATUS_COLOR.good,
                    data: [
                      { value: d.accepted, itemStyle: { color: STATUS_COLOR.good } },
                      { value: d.rejected, itemStyle: { color: STATUS_COLOR.bad } },
                      { value: d.expired, itemStyle: { color: STATUS_COLOR.warn } },
                    ],
                  },
                ],
              })}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="min-w-0 lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Yêu cầu gần đây</h2>
          {s.recent.length ? (
            <TableWrap>
              <thead>
                <tr>
                  <th className={th}>Mã</th>
                  <th className={th}>Loại</th>
                  <th className={th}>Chuyên khoa</th>
                  <th className={th}>Bệnh nhân</th>
                  <th className={th}>Bác sĩ</th>
                  <th className={th}>Trạng thái</th>
                  <th className={th}>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {s.recent.map((b) => (
                  <tr key={b.id} onClick={() => onOpen(b.id)} className="cursor-pointer hover:bg-slate-50">
                    <td className={`${td} font-mono text-xs font-semibold text-slate-900`}>{b.code}</td>
                    <td className={td}>{BTYPE[b.type] || b.type}</td>
                    <td className={td}>{b.specialty || '—'}</td>
                    <td className={td}>{b.patient_name}</td>
                    <td className={td}>{b.doctor_name || <span className="text-slate-400">Chưa có</span>}</td>
                    <td className={td}>
                      <StatusBadge status={b.status} />
                    </td>
                    <td className={`${td} text-xs text-slate-500`}>{dateTime(b.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <Empty title="Chưa có yêu cầu nào" />
          )}
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Bác sĩ hoàn thành nhiều ca nhất (30 ngày)</h2>
          <Card className="p-0">
            {s.topDoctors.length ? (
              <ol className="divide-y divide-slate-100">
                {s.topDoctors.map((doc, i) => (
                  <li key={doc.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-5 text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">BS. {doc.full_name}</span>
                    <RatingInline rating={doc.rating} />
                    <span className="w-14 text-right tabular-nums text-slate-700">{doc.completed} ca</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="p-4">
                <Empty title="Chưa có ca hoàn thành" />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
