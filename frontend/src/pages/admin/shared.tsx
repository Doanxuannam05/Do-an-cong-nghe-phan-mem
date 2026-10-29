/** Thành phần dùng chung cho các trang Admin: biểu đồ ECharts, bảng, phân trang, tab, hộp thoại */
import { useEffect, useState, type ReactNode } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { inputCls } from '@/components/kit'

// ───────── Kiểu dữ liệu ─────────
export interface Paged<T> {
  items: T[]
  page: number
  limit: number
  total: number
  totalPages: number
}

// ───────── Màu ─────────
export const PALETTE = ['#0f766e', '#2563eb', '#d97706', '#7c3aed']
export const ALGO_COLOR: Record<string, string> = { random: '#94a3b8', nearest: '#2563eb', multi: '#0f766e' }
export const STATUS_COLOR = { good: '#059669', warn: '#d97706', bad: '#e11d48', neutral: '#94a3b8', info: '#2563eb' }
const AXIS = '#64748b'
const SPLIT = '#e2e8f0'

// ───────── Biểu đồ ─────────
export function Chart({ option, height = 260, className }: { option: EChartsOption; height?: number; className?: string }) {
  return <ReactECharts option={option} notMerge lazyUpdate style={{ height, width: '100%' }} className={className} opts={{ renderer: 'canvas' }} />
}

const dash = (color: string) => `<span style="display:inline-block;width:12px;height:2.5px;border-radius:2px;background:${color};vertical-align:middle;margin-right:6px"></span>`

type Fmt = (v: number) => string
const defaultFmt: Fmt = (v) => (Number.isInteger(v) ? v.toLocaleString('vi-VN') : v.toFixed(2))

interface TipParam {
  axisValueLabel?: string
  name?: string
  seriesName?: string
  color?: string
  value?: unknown
  data?: unknown
}

/** Tooltip: tiêu đề + mỗi dòng 1 vạch màu 12×2.5px, hỗ trợ data dạng { value, sd } */
export function tooltipFormatter(fmt: Fmt = defaultFmt) {
  return (raw: unknown) => {
    const ps = (Array.isArray(raw) ? raw : [raw]) as TipParam[]
    if (!ps.length) return ''
    const title = ps[0].axisValueLabel ?? ps[0].name ?? ''
    const rows = ps
      .filter((p) => p.seriesName !== '__err')
      .map((p) => {
        const d = p.data as { value?: unknown; sd?: number | null } | number | null
        const v = typeof d === 'object' && d !== null && 'value' in d ? d.value : p.value
        const num = Array.isArray(v) ? Number(v[v.length - 1]) : Number(v)
        const sd = typeof d === 'object' && d !== null && 'sd' in d && d.sd != null ? ` <span style="color:#64748b">± ${fmt(Number(d.sd))}</span>` : ''
        const val = v == null || Number.isNaN(num) ? '—' : fmt(num)
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:3px"><span>${dash(String(p.color || '#0f766e'))}${p.seriesName ?? ''}</span><b style="font-variant-numeric:tabular-nums">${val}${sd}</b></div>`
      })
      .join('')
    return `<div style="font-size:12px;min-width:140px"><div style="color:#334155;font-weight:600;margin-bottom:2px">${title}</div>${rows}</div>`
  }
}

export interface SeriesSpec {
  name: string
  data: (number | null | { value: number | null; sd?: number | null; itemStyle?: { color: string } })[]
  color: string
  type?: 'bar' | 'line'
  stack?: string
  dashed?: boolean
  area?: boolean
}

/** Biểu đồ cột/đường trên trục danh mục – 1 trục y duy nhất */
export function cartesian({
  categories, series, fmt = defaultFmt, axisFmt, horizontal = false, yMin, yMax, scale = false, legend, grid, barMaxWidth = 20, extra = [],
}: {
  categories: string[]
  series: SeriesSpec[]
  fmt?: Fmt
  axisFmt?: Fmt
  horizontal?: boolean
  yMin?: number
  yMax?: number
  /** không bắt buộc bắt đầu từ 0 (chỉ dùng cho biểu đồ đường) */
  scale?: boolean
  legend?: boolean
  grid?: Record<string, number | string>
  barMaxWidth?: number
  extra?: unknown[]
}): EChartsOption {
  const showLegend = legend ?? series.length >= 2
  const catAxis = {
    type: 'category' as const,
    data: categories,
    axisLine: { show: true, lineStyle: { color: '#cbd5e1' } },
    axisTick: { show: false },
    axisLabel: { color: AXIS, fontSize: 11, hideOverlap: true },
  }
  const valAxis = {
    type: 'value' as const,
    min: yMin,
    max: yMax,
    scale,
    axisLine: { show: false },
    axisLabel: { color: AXIS, fontSize: 11, formatter: (v: number) => (axisFmt || fmt)(v) },
    splitLine: { lineStyle: { color: SPLIT, type: 'dashed' as const } },
  }
  return {
    backgroundColor: 'transparent',
    animationDuration: 300,
    grid: { left: 8, right: 12, top: showLegend ? 36 : 14, bottom: 4, containLabel: true, ...grid },
    legend: showLegend
      ? { type: 'plain', icon: 'roundRect', itemWidth: 12, itemHeight: 3, top: 0, left: 0, textStyle: { color: '#475569', fontSize: 12 }, data: series.map((s) => s.name) }
      : undefined,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: series.some((s) => s.type === 'line') ? 'line' : 'shadow', lineStyle: { color: '#cbd5e1' }, shadowStyle: { color: 'rgba(148,163,184,0.12)' } },
      backgroundColor: '#fff',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: '#0f172a' },
      extraCssText: 'box-shadow:0 4px 12px rgba(15,23,42,.08);border-radius:10px;',
      formatter: tooltipFormatter(fmt) as never,
    },
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? { ...catAxis, inverse: true } : valAxis,
    series: [
      ...series.map((s) =>
        s.type === 'line'
          ? {
              name: s.name, type: 'line' as const, data: s.data, smooth: false, symbol: 'circle', symbolSize: 5, showSymbol: categories.length <= 12,
              lineStyle: { width: 2, color: s.color, type: s.dashed ? ('dashed' as const) : ('solid' as const) }, itemStyle: { color: s.color },
              areaStyle: s.area ? { color: s.color, opacity: 0.08 } : undefined, stack: s.stack, connectNulls: true,
            }
          : {
              name: s.name, type: 'bar' as const, data: s.data, stack: s.stack, barMaxWidth, barGap: '30%',
              itemStyle: { color: s.color, borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
            },
      ),
      ...(extra as never[]),
    ],
  } as EChartsOption
}

/** Thanh sai số (mean ± sd) cho biểu đồ cột 1 series: mỗi phần tử [chỉ số danh mục, thấp, cao] */
export function errorBars(points: [number, number, number][]) {
  return {
    name: '__err',
    type: 'custom',
    data: points,
    z: 10,
    silent: true,
    tooltip: { show: false },
    renderItem: (_p: unknown, api: { value: (i: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[] }) => {
      const x = api.value(0)
      const lo = api.coord([x, api.value(1)])
      const hi = api.coord([x, api.value(2)])
      const w = Math.max(4, api.size([1, 0])[0] * 0.08)
      const style = { stroke: '#334155', lineWidth: 1.2 }
      return {
        type: 'group',
        children: [
          { type: 'line', shape: { x1: lo[0], y1: lo[1], x2: hi[0], y2: hi[1] }, style },
          { type: 'line', shape: { x1: lo[0] - w, y1: lo[1], x2: lo[0] + w, y2: lo[1] }, style },
          { type: 'line', shape: { x1: hi[0] - w, y1: hi[1], x2: hi[0] + w, y2: hi[1] }, style },
        ],
      }
    },
  }
}

// ───────── Bảng ─────────
export const th = 'sticky top-0 z-[1] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-600'
export const td = 'whitespace-nowrap border-b border-slate-100 px-3 py-2 align-middle text-slate-700'

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-slate-200 bg-white', className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    </div>
  )
}

export function Pagination({ page, totalPages, total, onPage, unit = 'mục' }: { page: number; totalPages: number; total: number; onPage: (p: number) => void; unit?: string }) {
  if (!total) return null
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
      <span>
        Tổng <b className="tabular-nums text-slate-800">{total.toLocaleString('vi-VN')}</b> {unit} · trang {page}/{Math.max(1, totalPages)}
      </span>
      <div className="flex items-center gap-1">
        <button aria-label="Trang trước" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-slate-200 bg-white p-1.5 hover:bg-slate-50 disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button aria-label="Trang sau" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="rounded-lg border border-slate-200 bg-white p-1.5 hover:bg-slate-50 disabled:opacity-40">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ───────── Tab gạch chân ─────────
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number | null }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm', value === t.value ? 'border-teal-700 font-semibold text-teal-800' : 'border-transparent text-slate-600 hover:text-slate-900')}
        >
          {t.label}
          {t.count != null && <span className={cn('rounded-full px-1.5 text-xs tabular-nums', value === t.value ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-600')}>{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ───────── Hộp thoại ─────────
export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center" onMouseDown={onClose}>
      <div className={cn('w-full rounded-2xl border border-slate-200 bg-white shadow-xl', wide ? 'max-w-2xl' : 'max-w-md')} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button aria-label="Đóng" onClick={onClose} className="rounded-full p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

// ───────── Ô tìm kiếm + debounce ─────────
export function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(inputCls, 'py-2 pl-9')} />
    </div>
  )
}

export const selectCls = cn(inputCls, 'w-auto py-2 pr-8')

/** Xây query string, bỏ qua giá trị rỗng */
export function qs(params: Record<string, string | number | undefined | null>) {
  const s = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') s.set(k, String(v))
  })
  const str = s.toString()
  return str ? `?${str}` : ''
}

/** Tải CSV phía trình duyệt (có BOM để Excel đọc đúng tiếng Việt) */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const blob = new Blob(['\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function CardTitle({ children, hint, action }: { children: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{children}</h2>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

export const num = (n?: number | null, d = 0) => (n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d }))
