import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { pct, relative, vnd } from '@/lib/format'
import { Card, Empty, ErrorBox, PageHeader, SectionTitle, Spinner, Stars, Stat, StatusBadge } from '@/components/kit'
import { LOAD_ERROR, useDoctorStats } from './common'

const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const fmtMs = (ms?: number | null) => {
  if (ms == null) return '—'
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)} giây`
  if (s < 3600) return `${Math.round(s / 60)} phút`
  return `${(s / 3600).toFixed(1)} giờ`
}

const STATUS_ORDER = ['OFFERED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'NO_DOCTOR_FOUND']

export default function StatsPage() {
  const q = useDoctorStats()
  const s = q.data

  const option = useMemo(() => {
    const series = s?.series || []
    return {
      backgroundColor: 'transparent',
      grid: { left: 8, right: 8, top: 16, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(15,118,110,0.06)' } },
        backgroundColor: '#ffffff',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        padding: [6, 10],
        textStyle: { color: '#0f172a', fontSize: 12 },
        extraCssText: 'box-shadow:0 4px 12px rgba(15,23,42,.08);border-radius:8px;',
        formatter: (p: { name: string; value: number }[]) => `<div style="color:#64748b">${p[0].name}</div><div><b>${p[0].value}</b> ca hoàn thành</div>`,
      },
      xAxis: {
        type: 'category',
        data: series.map((x) => fmtDay(x.day)),
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        axisTick: { show: false },
        axisLabel: { color: '#64748b', fontSize: 10, interval: 1 },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
        axisLabel: { color: '#64748b', fontSize: 10 },
      },
      series: [
        {
          type: 'bar',
          name: 'Hoàn thành',
          data: series.map((x) => x.completed),
          itemStyle: { color: '#0f766e', borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 18,
        },
      ],
    }
  }, [s?.series])

  const dist = s?.ratingDistribution || {}
  const distTotal = [1, 2, 3, 4, 5].reduce((a, k) => a + (dist[k] || 0), 0)
  const series14 = (s?.series || []).reduce((a, x) => a + x.completed, 0)

  return (
    <div>
      <PageHeader title="Thống kê cá nhân" back />
      <div className="px-4 pb-6 pt-4">
        {q.isLoading ? (
          <Spinner />
        ) : q.isError || !s ? (
          <ErrorBox message={LOAD_ERROR} onRetry={() => q.refetch()} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Ca hoàn thành" value={s.byStatus.COMPLETED || 0} hint={`${series14} ca trong 14 ngày`} />
              <Stat label="Tỷ lệ nhận yêu cầu" value={pct(s.acceptanceRate, 0)} hint={`${s.offers.accepted || 0}/${s.offers.offered || 0} yêu cầu`} />
              <Stat label="Doanh thu tháng này" value={<span className="text-xl">{vnd(s.revenueMonth)}</span>} hint={`Tổng: ${vnd(s.revenue)}`} />
              <Stat label="Đánh giá trung bình" value={s.rating ? s.rating.toFixed(1) : '—'} hint={`${s.totalReviews || 0} lượt đánh giá`} />
            </div>

            <SectionTitle>Phản hồi yêu cầu</SectionTitle>
            <Card className="p-0">
              <div className="grid grid-cols-4 divide-x divide-slate-100 text-center">
                {[
                  ['Đã nhận', s.offers.offered],
                  ['Chấp nhận', s.offers.accepted],
                  ['Từ chối', s.offers.rejected],
                  ['Hết hạn', s.offers.expired],
                ].map(([l, v]) => (
                  <div key={l as string} className="px-2 py-3">
                    <p className="text-lg font-semibold tabular-nums text-slate-900">{v ?? 0}</p>
                    <p className="text-[11px] text-slate-500">{l}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 px-4 py-2.5 text-sm text-slate-600">
                Thời gian phản hồi trung bình: <span className="font-semibold text-slate-900">{fmtMs(s.offers.avgResponseMs)}</span>
              </div>
            </Card>

            <SectionTitle>Ca hoàn thành 14 ngày qua</SectionTitle>
            <Card className="px-2 py-3">
              {series14 === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-slate-500">Chưa có ca hoàn thành trong 14 ngày qua.</p>
              ) : (
                <ReactECharts option={option} style={{ height: 200 }} opts={{ renderer: 'svg' }} notMerge />
              )}
            </Card>

            <SectionTitle>Lịch khám theo trạng thái</SectionTitle>
            <Card className="p-0">
              {Object.keys(s.byStatus).length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Chưa có lịch khám.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {Object.entries(s.byStatus)
                    .sort((a, b) => STATUS_ORDER.indexOf(a[0]) - STATUS_ORDER.indexOf(b[0]))
                    .map(([k, n]) => (
                      <div key={k} className="flex items-center justify-between px-4 py-2.5">
                        <StatusBadge status={k} />
                        <span className="text-sm font-semibold tabular-nums text-slate-900">{n}</span>
                      </div>
                    ))}
                </div>
              )}
            </Card>

            <SectionTitle>Phân bố đánh giá</SectionTitle>
            <Card>
              {distTotal === 0 ? (
                <p className="py-2 text-center text-sm text-slate-500">Chưa có đánh giá.</p>
              ) : (
                <div className="space-y-2">
                  {[5, 4, 3, 2, 1].map((k) => {
                    const n = dist[k] || 0
                    return (
                      <div key={k} className="flex items-center gap-3 text-sm">
                        <span className="w-8 shrink-0 tabular-nums text-slate-600">{k} sao</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-teal-700" style={{ width: `${(n / distTotal) * 100}%` }} />
                        </div>
                        <span className="w-6 shrink-0 text-right tabular-nums text-slate-700">{n}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            <SectionTitle>Đánh giá gần đây</SectionTitle>
            {!s.reviews.length ? (
              <Empty title="Chưa có đánh giá" />
            ) : (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {s.reviews.map((r) => (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">{r.patient_name}</span>
                      <span className="shrink-0 text-xs text-slate-500">{relative(r.created_at)}</span>
                    </div>
                    <Stars value={r.rating} size={12} className="mt-0.5" />
                    {r.comment && <p className="mt-1 text-sm text-slate-700">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
