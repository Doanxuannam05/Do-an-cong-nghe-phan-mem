/**
 * Thực nghiệm NCKH – chạy bộ mô phỏng (backend/lib/simulator.js) dùng chính Matching Engine của hệ thống.
 *   Thí nghiệm 1: Random vs Nearest vs Multi-Criteria
 *   Thí nghiệm 2: trọng số khoảng cách 20/40/60% (+ Nearest làm mốc)
 *   Thí nghiệm 3: khả năng mở rộng theo số bác sĩ
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, Download, Play } from 'lucide-react'
import { get, post, errorMessage } from '@/lib/http'
import { ALGO, dateTime, pct } from '@/lib/format'
import { AdminPage } from '@/components/layouts'
import { Btn, Card, Empty, ErrorBox, Field, Spinner, inputCls } from '@/components/kit'
import { cn } from '@/lib/utils'
import { ALGO_COLOR, PALETTE, CardTitle, Chart, TableWrap, Tabs, cartesian, downloadCsv, errorBars, td, th } from './shared'

// ───────────────────────── Kiểu dữ liệu ─────────────────────────
type Exp = 'algorithms' | 'weights' | 'scale'
type Algo = 'random' | 'nearest' | 'multi'
type MS = { mean: number; sd: number } | null
type MetricKey =
  | 'successRate' | 'acceptanceRate' | 'avgDistanceKm' | 'avgWaitSec' | 'satisfaction' | 'satisfactionAll' | 'offersPerRequest' | 'timeoutRate'
  | 'exactSpecialtyRate' | 'loadGini' | 'matchingMsAvg' | 'matchingMsP95' | 'retrievalMsAvg' | 'fullScanMsAvg' | 'avgCandidates'
type Agg = { algorithm: Algo; runs: number } & Record<MetricKey, MS>
type WeightRow = Agg & { distanceWeight: number; weights: Record<string, number> }
type ScaleRow = Agg & { doctors: number }

interface Params {
  doctors: number
  requests: number
  radiusKm: number
  onlineRate: number
  windowMin: number
  rho: number
  repetitions: number
  seed: number
  distanceWeights?: number[]
  doctorCounts?: number[]
}
interface Run {
  id: number
  experiment: Exp
  params: Params
  results: { rows: Agg[] } | { rows: WeightRow[]; baseline: Agg } | { rows: ScaleRow[] }
  durationMs: number
  createdAt: string
}
interface HistoryItem {
  id: number
  experiment: Exp
  params: Params
  duration_ms: number
  created_at: string
}

const ALGOS: Algo[] = ['random', 'nearest', 'multi']
const EXP_LABEL: Record<Exp, string> = { algorithms: 'Thí nghiệm 1 · So sánh thuật toán', weights: 'Thí nghiệm 2 · Trọng số khoảng cách', scale: 'Thí nghiệm 3 · Khả năng mở rộng' }
const EXP_SHORT: Record<Exp, string> = { algorithms: 'So sánh thuật toán', weights: 'Trọng số khoảng cách', scale: 'Khả năng mở rộng' }
const EXP_DESC: Record<Exp, string> = {
  algorithms: 'Ba thuật toán chạy trên cùng một kịch bản (cùng seed) để so sánh công bằng. Mỗi chỉ số là trung bình ± độ lệch chuẩn qua các lần lặp, mỗi lần lặp sinh kịch bản mới với seed + 101·r.',
  weights: 'Multi-Criteria với trọng số khoảng cách thay đổi; bốn trọng số còn lại co giãn theo tỷ lệ mặc định để tổng bằng 1. Nearest được chạy kèm làm mốc so sánh.',
  scale: 'Đo thời gian ghép cặp khi số bác sĩ tăng dần. Truy xuất ứng viên dùng chỉ mục lưới ô ~1 km; với Multi-Criteria đo thêm thời gian quét toàn bộ danh sách để so sánh.',
}

// ───────────────────────── Chỉ số ─────────────────────────
const f2 = (v: number) => v.toFixed(2)
const fms = (v: number) => `${v < 0.01 ? v.toFixed(4) : v < 1 ? v.toFixed(3) : v.toFixed(2)} ms`
const METRIC: Record<MetricKey, { label: string; fmt: (v: number) => string; better: 'high' | 'low' | null; desc: string; isRate?: boolean; max?: number }> = {
  successRate: { label: 'Tỷ lệ thành công', fmt: (v) => pct(v), better: 'high', isRate: true, desc: 'Số yêu cầu có bác sĩ nhận trước khi bệnh nhân hết kiên nhẫn (150 s) / tổng số yêu cầu.' },
  acceptanceRate: { label: 'Tỷ lệ chấp nhận', fmt: (v) => pct(v), better: 'high', isRate: true, desc: 'Số lời mời được bác sĩ chấp nhận / tổng số lời mời đã gửi.' },
  avgDistanceKm: { label: 'Khoảng cách TB', fmt: (v) => `${v.toFixed(2)} km`, better: 'low', desc: 'Khoảng cách đường chim bay bệnh nhân – bác sĩ, tính trên các ca thành công.' },
  avgWaitSec: { label: 'Thời gian chờ TB', fmt: (v) => `${v.toFixed(1)} s`, better: 'low', desc: 'Từ lúc gửi yêu cầu đến khi có bác sĩ nhận (gồm thời gian bị từ chối và hết hạn 30 s), tính trên ca thành công.' },
  satisfaction: { label: 'Độ hài lòng (ca thành công)', fmt: f2, better: 'high', max: 5, desc: 'S = 1 + 4·(0.35·q̂ + 0.25·spec + 0.20·distScore + 0.20·waitScore), thang 1–5, tính trên ca thành công.' },
  satisfactionAll: { label: 'Độ hài lòng (mọi yêu cầu)', fmt: f2, better: 'high', max: 5, desc: 'Như trên nhưng tính trên mọi yêu cầu; yêu cầu thất bại hoặc không có ứng viên được tính 1 điểm.' },
  offersPerRequest: { label: 'Lời mời / yêu cầu', fmt: f2, better: 'low', desc: 'Số lời mời trung bình phải gửi cho mỗi yêu cầu.' },
  timeoutRate: { label: 'Tỷ lệ lời mời hết hạn', fmt: (v) => pct(v), better: 'low', isRate: true, desc: 'Lời mời không được phản hồi trong 30 s (giả định 10%).' },
  exactSpecialtyRate: { label: 'Đúng chuyên khoa', fmt: (v) => pct(v), better: 'high', isRate: true, desc: 'Tỷ lệ ca thành công được bác sĩ đúng chuyên khoa yêu cầu phục vụ (còn lại là chuyên khoa liên quan).' },
  loadGini: { label: 'Hệ số Gini phân tải', fmt: (v) => v.toFixed(3), better: 'low', desc: 'Mức chênh lệch số ca được giao giữa các bác sĩ online; 0 = phân tải đều tuyệt đối.' },
  matchingMsAvg: { label: 'Thời gian ghép cặp TB', fmt: fms, better: 'low', desc: 'Thời gian truy xuất ứng viên + lọc + xếp hạng cho một yêu cầu.' },
  matchingMsP95: { label: 'Thời gian ghép cặp p95', fmt: fms, better: 'low', desc: 'Phân vị 95 của thời gian ghép cặp.' },
  retrievalMsAvg: { label: 'Truy xuất qua chỉ mục lưới', fmt: fms, better: 'low', desc: 'Thời gian lấy danh sách ứng viên từ chỉ mục lưới ~1 km.' },
  fullScanMsAvg: { label: 'Quét toàn bộ', fmt: fms, better: 'low', desc: 'Thời gian tính khoảng cách tới mọi bác sĩ để lọc theo bán kính (không dùng chỉ mục).' },
  avgCandidates: { label: 'Số ứng viên TB', fmt: (v) => v.toFixed(1), better: null, desc: 'Số bác sĩ trả về từ chỉ mục lưới trước khi lọc điều kiện.' },
}
const ALL_METRICS = Object.keys(METRIC) as MetricKey[]
const EXP1_METRICS: MetricKey[] = ['successRate', 'acceptanceRate', 'avgDistanceKm', 'avgWaitSec', 'satisfaction', 'satisfactionAll', 'loadGini', 'exactSpecialtyRate', 'matchingMsAvg']
const EXP1_TABLE: MetricKey[] = [...EXP1_METRICS, 'offersPerRequest', 'timeoutRate', 'matchingMsP95']
const EXP2_METRICS: MetricKey[] = ['successRate', 'acceptanceRate', 'avgDistanceKm', 'avgWaitSec', 'satisfactionAll', 'loadGini']
const EXP2_TABLE: MetricKey[] = ['successRate', 'acceptanceRate', 'avgDistanceKm', 'avgWaitSec', 'satisfaction', 'satisfactionAll', 'loadGini', 'exactSpecialtyRate']
const EXP3_TABLE: MetricKey[] = ['matchingMsAvg', 'matchingMsP95', 'retrievalMsAvg', 'fullScanMsAvg', 'avgCandidates', 'successRate']

const mean = (r: Agg | undefined, k: MetricKey) => r?.[k]?.mean ?? null
const sdv = (r: Agg | undefined, k: MetricKey) => r?.[k]?.sd ?? 0
const pp = (d: number) => `${Math.abs(d * 100).toFixed(1)} điểm %`
const n0 = (n: number) => n.toLocaleString('vi-VN')
const wLabel = (w: number) => `${Math.round(w * 100)}%`

// ───────────────────────── Tham số ─────────────────────────
interface FormState {
  doctors: string
  requests: string
  radiusKm: string
  onlineRate: string
  windowMin: string
  rho: string
  repetitions: string
  seed: string
  distanceWeights: string
  doctorCounts: string
}
const DEFAULT_FORM: FormState = {
  doctors: '500', requests: '1000', radiusKm: '5', onlineRate: '0.7', windowMin: '240', rho: '0.5', repetitions: '3', seed: '42', distanceWeights: '20, 40, 60', doctorCounts: '100, 500, 1000, 5000',
}
const LIMITS: Record<Exclude<keyof FormState, 'distanceWeights' | 'doctorCounts'>, [number, number, boolean]> = {
  doctors: [20, 5000, true], requests: [50, 3000, true], radiusKm: [1, 20, false], onlineRate: [0.1, 1, false], windowMin: [30, 720, true], rho: [0, 1, false], repetitions: [1, 10, true], seed: [1, 1e9, true],
}
const WORK_LIMIT = 1.2e8
const list = (s: string) => s.split(/[,;\s]+/).filter(Boolean).map(Number)

function formFromParams(p: Params): FormState {
  return {
    doctors: String(p.doctors), requests: String(p.requests), radiusKm: String(p.radiusKm), onlineRate: String(p.onlineRate), windowMin: String(p.windowMin), rho: String(p.rho),
    repetitions: String(p.repetitions), seed: String(p.seed),
    distanceWeights: (p.distanceWeights?.length ? p.distanceWeights : [0.2, 0.4, 0.6]).map((x) => Math.round(x * 100)).join(', '),
    doctorCounts: (p.doctorCounts?.length ? p.doctorCounts : [100, 500, 1000, 5000]).join(', '),
  }
}

function validate(f: FormState, exp: Exp): { params?: Params; error?: string; work: number } {
  const p: Record<string, number> = {}
  for (const [k, [lo, hi, int]] of Object.entries(LIMITS)) {
    const v = Number(f[k as keyof FormState])
    if (!Number.isFinite(v) || v < lo || v > hi || (int && !Number.isInteger(v))) return { error: `${FIELD_LABEL[k]} phải là ${int ? 'số nguyên ' : ''}trong khoảng ${lo}–${n0(hi)}`, work: 0 }
    p[k] = v
  }
  const params = p as unknown as Params
  if (exp === 'weights') {
    const w = list(f.distanceWeights)
    if (!w.length || w.length > 6 || w.some((x) => !Number.isFinite(x) || x < 5 || x > 90)) return { error: 'Trọng số khoảng cách: 1–6 giá trị, mỗi giá trị 5–90 (%)', work: 0 }
    params.distanceWeights = w.map((x) => x / 100)
  }
  if (exp === 'scale') {
    const c = list(f.doctorCounts)
    if (!c.length || c.length > 6 || c.some((x) => !Number.isInteger(x) || x < 20 || x > 5000)) return { error: 'Số bác sĩ: 1–6 giá trị nguyên, mỗi giá trị 20–5.000', work: 0 }
    params.doctorCounts = c
  }
  // Cùng công thức giới hạn khối lượng với backend (routes/experiments.js)
  const work = exp === 'scale' ? (params.doctorCounts || []).reduce((s, n) => s + n, 0) * params.requests * 3 * params.repetitions : params.doctors * params.requests * 3 * params.repetitions
  if (work > WORK_LIMIT) return { error: `Khối lượng mô phỏng ${(work / 1e6).toFixed(0)} triệu vượt giới hạn ${WORK_LIMIT / 1e6} triệu. Giảm số lần lặp, số yêu cầu hoặc số bác sĩ.`, work }
  return { params, work }
}
const FIELD_LABEL: Record<string, string> = {
  doctors: 'Số bác sĩ', requests: 'Số yêu cầu', radiusKm: 'Bán kính tìm kiếm', onlineRate: 'Tỷ lệ bác sĩ online', windowMin: 'Khung thời gian', rho: 'Hệ số ρ', repetitions: 'Số lần lặp', seed: 'Seed',
}

// ───────────────────────── Trang ─────────────────────────
export default function LabPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Exp>('algorithms')
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [selected, setSelected] = useState<Partial<Record<Exp, number>>>({})

  const history = useQuery({ queryKey: ['experiments'], queryFn: () => get<HistoryItem[]>('experiments'), staleTime: 60_000 })

  // Mặc định hiển thị lần chạy gần nhất của từng thí nghiệm
  const latest = useMemo(() => {
    const m: Partial<Record<Exp, number>> = {}
    for (const h of history.data || []) if (m[h.experiment] == null) m[h.experiment] = h.id
    return m
  }, [history.data])
  const runId = selected[tab] ?? latest[tab]

  const run = useQuery({
    queryKey: ['experiments', runId],
    queryFn: () => get<Run>(`experiments/${runId}`),
    enabled: runId != null,
    staleTime: Infinity,
  })

  const v = validate(form, tab)
  const exec = useMutation({
    mutationFn: (b: { experiment: Exp; params: Params }) => post<Run>('experiments/run', b),
    onSuccess: (r) => {
      qc.setQueryData(['experiments', r.id], r)
      setSelected((s) => ({ ...s, [r.experiment]: r.id }))
      qc.invalidateQueries({ queryKey: ['experiments'], exact: true })
      toast.success(`Đã chạy xong ${EXP_SHORT[r.experiment].toLowerCase()} trong ${(r.durationMs / 1000).toFixed(1)} s`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const loadRun = (h: HistoryItem) => {
    setTab(h.experiment)
    setSelected((s) => ({ ...s, [h.experiment]: h.id }))
    setForm(formFromParams(h.params))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const data = run.data && run.data.experiment === tab ? run.data : null

  return (
    <AdminPage title="Thực nghiệm NCKH" subtitle="Mô phỏng sự kiện rời rạc dùng chính Matching Engine của hệ thống, kết quả tái lập được theo seed">
      <Tabs value={tab} onChange={setTab} tabs={(['algorithms', 'weights', 'scale'] as Exp[]).map((e) => ({ value: e, label: EXP_LABEL[e] }))} />

      <Card className="mb-4">
        <CardTitle hint={EXP_DESC[tab]}>Tham số mô phỏng</CardTitle>
        <ParamForm exp={tab} form={form} setForm={setForm} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Btn loading={exec.isPending} disabled={!v.params || exec.isPending} onClick={() => v.params && exec.mutate({ experiment: tab, params: v.params })}>
            {!exec.isPending && <Play className="h-4 w-4" />}
            {exec.isPending ? 'Đang mô phỏng…' : 'Chạy thí nghiệm'}
          </Btn>
          <Btn variant="outline" disabled={!data} onClick={() => data && exportCsv(data)}>
            <Download className="h-4 w-4" /> Xuất CSV
          </Btn>
          <Btn variant="ghost" onClick={() => setForm(DEFAULT_FORM)}>
            Khôi phục mặc định
          </Btn>
          <span className={cn('text-xs', v.error ? 'text-rose-700' : 'text-slate-500')}>
            {v.error || `Khối lượng ước tính ${(v.work / 1e6).toFixed(1)} / ${WORK_LIMIT / 1e6} triệu phép tính · thường mất 0,5–5 giây`}
          </span>
        </div>
      </Card>

      {exec.isPending && (
        <Card className="mb-4">
          <Spinner label={`Đang chạy ${EXP_SHORT[tab].toLowerCase()} trên máy chủ…`} />
        </Card>
      )}
      {!exec.isPending && run.isLoading && <Spinner label="Đang tải kết quả…" />}
      {run.error && <ErrorBox message={errorMessage(run.error)} onRetry={() => run.refetch()} />}
      {!exec.isPending && !run.isLoading && !data && !history.isLoading && <Empty title="Chưa có kết quả cho thí nghiệm này" hint="Điều chỉnh tham số rồi bấm “Chạy thí nghiệm”." />}

      {data && !exec.isPending && (
        <div className="space-y-4">
          <RunMeta r={data} />
          {data.experiment === 'algorithms' && <Exp1 rows={(data.results as { rows: Agg[] }).rows} />}
          {data.experiment === 'weights' && <Exp2 rows={(data.results as { rows: WeightRow[]; baseline: Agg }).rows} baseline={(data.results as { rows: WeightRow[]; baseline: Agg }).baseline} />}
          {data.experiment === 'scale' && <Exp3 rows={(data.results as { rows: ScaleRow[] }).rows} />}
        </div>
      )}

      <ModelSection />

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Lịch sử chạy</h2>
        {history.isLoading && <Spinner />}
        {history.error && <ErrorBox message={errorMessage(history.error)} onRetry={() => history.refetch()} />}
        {history.data && !history.data.length && <Empty title="Chưa có lần chạy nào" />}
        {!!history.data?.length && (
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>#</th>
                <th className={th}>Thí nghiệm</th>
                <th className={th}>Tham số</th>
                <th className={`${th} text-right`}>Thời gian chạy</th>
                <th className={th}>Lúc</th>
              </tr>
            </thead>
            <tbody>
              {history.data.map((h) => {
                const active = runId === h.id && tab === h.experiment
                return (
                  <tr key={h.id} onClick={() => loadRun(h)} className={cn('cursor-pointer', active ? 'bg-teal-50/70' : 'hover:bg-slate-50')}>
                    <td className={`${td} tabular-nums text-slate-500`}>{h.id}</td>
                    <td className={`${td} font-medium text-slate-900`}>{EXP_SHORT[h.experiment] || h.experiment}</td>
                    <td className={`${td} text-xs text-slate-600`}>{paramSummary(h.experiment, h.params)}</td>
                    <td className={`${td} text-right tabular-nums`}>{(h.duration_ms / 1000).toFixed(2)} s</td>
                    <td className={`${td} text-xs text-slate-500`}>{dateTime(h.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </div>
    </AdminPage>
  )
}

function paramSummary(exp: Exp, p: Params) {
  const base = [`${n0(p.requests)} yêu cầu`, `R ${p.radiusKm} km`, `online ${Math.round(p.onlineRate * 100)}%`, `ρ ${p.rho}`, `${p.repetitions} lần lặp`, `seed ${p.seed}`]
  if (exp === 'scale') return [`bác sĩ ${(p.doctorCounts?.length ? p.doctorCounts : [100, 500, 1000, 5000]).map(n0).join('/')}`, ...base].join(' · ')
  const head = `${n0(p.doctors)} bác sĩ`
  if (exp === 'weights') return [head, `w ${(p.distanceWeights?.length ? p.distanceWeights : [0.2, 0.4, 0.6]).map(wLabel).join('/')}`, ...base].join(' · ')
  return [head, ...base].join(' · ')
}

function ParamForm({ exp, form, setForm }: { exp: Exp; form: FormState; setForm: (f: FormState) => void }) {
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })
  const numInput = (k: keyof typeof LIMITS, step: string) => (
    <input type="number" inputMode="decimal" step={step} min={LIMITS[k][0]} max={LIMITS[k][1]} value={form[k]} onChange={set(k)} className={cn(inputCls, 'py-2 tabular-nums')} />
  )
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {exp === 'scale' ? (
        <Field label="Số bác sĩ (danh sách)" hint="Cách nhau bởi dấu phẩy, 20–5.000">
          <input value={form.doctorCounts} onChange={set('doctorCounts')} className={cn(inputCls, 'py-2')} />
        </Field>
      ) : (
        <Field label="Số bác sĩ" hint="20–5.000">
          {numInput('doctors', '10')}
        </Field>
      )}
      <Field label="Số yêu cầu" hint="50–3.000">
        {numInput('requests', '50')}
      </Field>
      <Field label="Bán kính (km)" hint="1–20">
        {numInput('radiusKm', '0.5')}
      </Field>
      <Field label="Tỷ lệ bác sĩ online" hint="0,1–1">
        {numInput('onlineRate', '0.05')}
      </Field>
      <Field label="Khung thời gian (phút)" hint="30–720">
        {numInput('windowMin', '10')}
      </Field>
      <Field label="Hệ số ρ" hint="Tương quan chất lượng – sẵn lòng nhận ca">
        {numInput('rho', '0.1')}
      </Field>
      <Field label="Số lần lặp" hint="1–10">
        {numInput('repetitions', '1')}
      </Field>
      <Field label="Seed" hint="Cùng seed → cùng kịch bản">
        {numInput('seed', '1')}
      </Field>
      {exp === 'weights' && (
        <Field label="Trọng số khoảng cách (%)" hint="Cách nhau bởi dấu phẩy, 5–90">
          <input value={form.distanceWeights} onChange={set('distanceWeights')} className={cn(inputCls, 'py-2')} />
        </Field>
      )}
    </div>
  )
}

function RunMeta({ r }: { r: Run }) {
  return (
    <p className="text-xs text-slate-500">
      Lần chạy #{r.id} · {dateTime(r.createdAt)} · {(r.durationMs / 1000).toFixed(2)} s · {paramSummary(r.experiment, r.params)}
    </p>
  )
}

function Conclusion({ lines }: { lines: string[] }) {
  if (!lines.length) return null
  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50/60 px-4 py-3">
      <p className="text-xs font-semibold text-teal-800">Nhận xét tự động từ số liệu</p>
      <p className="mt-1 text-sm leading-6 text-slate-800">{lines.join(' ')}</p>
    </div>
  )
}

/** Ô giá trị TB ± SD */
function MSCell({ v, k, best }: { v: MS; k: MetricKey; best?: boolean }) {
  if (!v) return <td className={`${td} text-right text-slate-400`}>—</td>
  const f = METRIC[k].fmt
  return (
    <td className={cn(td, 'text-right tabular-nums', best && 'font-semibold text-teal-800')}>
      {f(v.mean)}
      <span className="ml-1 text-xs font-normal text-slate-400">± {METRIC[k].isRate ? (v.sd * 100).toFixed(1) : f(v.sd).replace(/ (ms|km|s)$/, '')}</span>
    </td>
  )
}

function bestIndex(rows: Agg[], k: MetricKey) {
  const dir = METRIC[k].better
  if (!dir) return -1
  let bi = -1
  rows.forEach((r, i) => {
    const m = mean(r, k)
    if (m == null) return
    const b = bi >= 0 ? mean(rows[bi], k)! : null
    if (b == null || (dir === 'high' ? m > b : m < b)) bi = i
  })
  return bi
}

/** Biểu đồ cột nhỏ cho một chỉ số, kèm thanh sai số ± SD */
function MetricBars({ k, labels, rows, colors, height = 190 }: { k: MetricKey; labels: string[]; rows: Agg[]; colors: string[]; height?: number }) {
  const m = METRIC[k]
  const data = rows.map((r, i) => ({ value: mean(r, k), sd: r[k]?.sd ?? null, itemStyle: { color: colors[i] } }))
  const err = rows.map((r, i) => [i, (mean(r, k) ?? 0) - sdv(r, k), (mean(r, k) ?? 0) + sdv(r, k)] as [number, number, number]).filter((_, i) => mean(rows[i], k) != null)
  return (
    <Card className="p-3">
      <p className="text-xs font-semibold text-slate-800">{m.label}</p>
      <p className="mb-1 text-[11px] text-slate-500">{m.better === 'high' ? 'Cao hơn là tốt hơn' : m.better === 'low' ? 'Thấp hơn là tốt hơn' : ''}</p>
      <Chart
        height={height}
        option={cartesian({
          categories: labels,
          barMaxWidth: 24,
          yMin: 0,
          yMax: m.isRate ? 1 : m.max,
          fmt: m.fmt,
          axisFmt: m.isRate ? (v) => `${Math.round(v * 100)}%` : (v) => String(Number(v.toFixed(4))),
          series: [{ name: m.label, data, color: colors[0] }],
          extra: [errorBars(err)],
        })}
      />
    </Card>
  )
}

// ───────────────────────── Thí nghiệm 1 ─────────────────────────
function conclude1(rows: Agg[]): string[] {
  const by = Object.fromEntries(rows.map((r) => [r.algorithm, r])) as Partial<Record<Algo, Agg>>
  const out: string[] = []
  const bi = bestIndex(rows, 'successRate')
  if (bi >= 0) {
    const b = rows[bi]
    const others = rows.filter((_, i) => i !== bi)
    const parts = others.map((o) => `${ALGO[o.algorithm]} ${pp(mean(b, 'successRate')! - mean(o, 'successRate')!)}`)
    const noisy = others.some((o) => mean(b, 'successRate')! - mean(o, 'successRate')! < Math.max(sdv(b, 'successRate'), sdv(o, 'successRate')))
    out.push(`${ALGO[b.algorithm]} có tỷ lệ thành công cao nhất (${pct(mean(b, 'successRate'))}), cao hơn ${parts.join(' và ')}${noisy ? '; một phần chênh lệch nhỏ hơn độ lệch chuẩn giữa các lần lặp nên cần thêm lần lặp để khẳng định' : ''}.`)
  }
  const dm = mean(by.multi, 'avgDistanceKm')
  const dn = mean(by.nearest, 'avgDistanceKm')
  const dr = mean(by.random, 'avgDistanceKm')
  if (dm != null && dn != null && dr != null) out.push(`Khoảng cách trung bình của Multi-Criteria là ${dm.toFixed(2)} km, so với ${dn.toFixed(2)} km (Nearest) và ${dr.toFixed(2)} km (Random).`)
  const si = bestIndex(rows, 'satisfactionAll')
  if (si >= 0) out.push(`Độ hài lòng tính trên mọi yêu cầu cao nhất ở ${ALGO[rows[si].algorithm]} (${mean(rows[si], 'satisfactionAll')!.toFixed(2)}/5).`)
  const gi = bestIndex(rows, 'loadGini')
  if (gi >= 0) out.push(`${ALGO[rows[gi].algorithm]} phân tải đều nhất (Gini ${mean(rows[gi], 'loadGini')!.toFixed(3)}).`)
  const mm = mean(by.multi, 'matchingMsAvg')
  if (mm != null) out.push(`Thời gian ghép cặp trung bình của Multi-Criteria là ${fms(mm)} mỗi yêu cầu.`)
  return out
}

function Exp1({ rows }: { rows: Agg[] }) {
  const ordered = ALGOS.map((a) => rows.find((r) => r.algorithm === a)).filter(Boolean) as Agg[]
  const labels = ordered.map((r) => ALGO[r.algorithm])
  const colors = ordered.map((r) => ALGO_COLOR[r.algorithm])
  return (
    <>
      <Conclusion lines={conclude1(ordered)} />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {ordered.map((r) => (
          <span key={r.algorithm} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-3 rounded-sm" style={{ background: ALGO_COLOR[r.algorithm] }} />
            {ALGO[r.algorithm]}
          </span>
        ))}
        <span className="text-slate-400">Thanh đen: ± 1 độ lệch chuẩn</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {EXP1_METRICS.map((k) => (
          <MetricBars key={k} k={k} labels={labels} rows={ordered} colors={colors} />
        ))}
      </div>
      <ResultTable
        head={['Thuật toán']}
        rows={ordered.map((r) => ({ key: r.algorithm, cells: [<span key="a" className="inline-flex items-center gap-2 font-medium text-slate-900"><Dash color={ALGO_COLOR[r.algorithm]} />{ALGO[r.algorithm]}</span>], agg: r }))}
        metrics={EXP1_TABLE}
        highlight
      />
    </>
  )
}

// ───────────────────────── Thí nghiệm 2 ─────────────────────────
function conclude2(rows: WeightRow[], base: Agg): string[] {
  if (!rows.length) return []
  const out: string[] = []
  const lo = rows[0]
  const hi = rows[rows.length - 1]
  if (rows.length >= 2) {
    const d0 = mean(lo, 'avgDistanceKm')
    const d1 = mean(hi, 'avgDistanceKm')
    const s0 = mean(lo, 'successRate')
    const s1 = mean(hi, 'successRate')
    if (d0 != null && d1 != null && s0 != null && s1 != null)
      out.push(
        `Khi tăng trọng số khoảng cách từ ${wLabel(lo.distanceWeight)} lên ${wLabel(hi.distanceWeight)}, khoảng cách trung bình ${d1 <= d0 ? 'giảm' : 'tăng'} từ ${d0.toFixed(2)} km ${d1 <= d0 ? 'xuống' : 'lên'} ${d1.toFixed(2)} km, tỷ lệ thành công ${Math.abs(s1 - s0) < 0.0005 ? 'gần như không đổi' : `${s1 > s0 ? 'tăng' : 'giảm'} ${pp(s1 - s0)}`} (${pct(s0)} → ${pct(s1)}).`,
      )
  }
  const si = bestIndex(rows, 'satisfactionAll')
  const nb = mean(base, 'satisfactionAll')
  if (si >= 0) out.push(`Độ hài lòng tính trên mọi yêu cầu cao nhất ở mức ${wLabel(rows[si].distanceWeight)} (${mean(rows[si], 'satisfactionAll')!.toFixed(2)}/5)${nb != null ? `, so với ${nb.toFixed(2)}/5 của Nearest` : ''}.`)
  const bi = bestIndex(rows, 'successRate')
  const ns = mean(base, 'successRate')
  if (bi >= 0 && ns != null) {
    const d = mean(rows[bi], 'successRate')! - ns
    out.push(`Tỷ lệ thành công tốt nhất (${wLabel(rows[bi].distanceWeight)}: ${pct(mean(rows[bi], 'successRate'))}) ${Math.abs(d) < 0.0005 ? 'bằng' : d > 0 ? `cao hơn Nearest ${pp(d)}` : `thấp hơn Nearest ${pp(d)}`}${Math.abs(d) < 0.0005 ? ' Nearest' : ''}.`)
  }
  return out
}

function Exp2({ rows, baseline }: { rows: WeightRow[]; baseline: Agg }) {
  const sorted = [...rows].sort((a, b) => a.distanceWeight - b.distanceWeight)
  const cats = sorted.map((r) => wLabel(r.distanceWeight))
  return (
    <>
      <Conclusion lines={conclude2(sorted, baseline)} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {EXP2_METRICS.map((k) => {
          const m = METRIC[k]
          return (
            <Card key={k} className="p-3">
              <p className="text-xs font-semibold text-slate-800">{m.label}</p>
              <p className="mb-1 text-[11px] text-slate-500">Trục ngang: trọng số khoảng cách · {m.better === 'high' ? 'cao hơn là tốt hơn' : 'thấp hơn là tốt hơn'}</p>
              <Chart
                height={200}
                option={cartesian({
                  categories: cats,
                  scale: true,
                  fmt: m.fmt,
                  axisFmt: m.isRate ? (v) => `${(v * 100).toFixed(1)}%` : (v) => String(Number(v.toFixed(3))),
                  series: [
                    { name: 'Multi-Criteria', type: 'line', color: ALGO_COLOR.multi, data: sorted.map((r) => ({ value: mean(r, k), sd: r[k]?.sd ?? null })) },
                    { name: 'Nearest (mốc)', type: 'line', dashed: true, color: ALGO_COLOR.nearest, data: sorted.map(() => ({ value: mean(baseline, k), sd: baseline[k]?.sd ?? null })) },
                  ],
                })}
              />
            </Card>
          )
        })}
      </div>
      <ResultTable
        head={['Cấu hình', 'Trọng số (KC/CK/SS/ĐG/KN)']}
        rows={[
          { key: 'base', cells: [<span key="a" className="inline-flex items-center gap-2 font-medium text-slate-900"><Dash color={ALGO_COLOR.nearest} />Nearest (mốc)</span>, <span key="b" className="text-slate-400">—</span>], agg: baseline },
          ...sorted.map((r) => ({
            key: String(r.distanceWeight),
            cells: [
              <span key="a" className="inline-flex items-center gap-2 font-medium text-slate-900"><Dash color={ALGO_COLOR.multi} />Multi-Criteria, KC {wLabel(r.distanceWeight)}</span>,
              <span key="b" className="font-mono text-xs text-slate-600">{['distance', 'specialty', 'availability', 'rating', 'experience'].map((w) => (r.weights?.[w] ?? 0).toFixed(2)).join(' / ')}</span>,
            ],
            agg: r as Agg,
          })),
        ]}
        metrics={EXP2_TABLE}
        highlight
        note="KC = khoảng cách, CK = chuyên khoa, SS = sẵn sàng, ĐG = đánh giá, KN = kinh nghiệm."
      />
    </>
  )
}

// ───────────────────────── Thí nghiệm 3 ─────────────────────────
function conclude3(rows: ScaleRow[]): string[] {
  const out: string[] = []
  const multi = rows.filter((r) => r.algorithm === 'multi').sort((a, b) => a.doctors - b.doctors)
  if (!multi.length) return out
  const small = multi[0]
  const big = multi[multi.length - 1]
  const a = mean(big, 'matchingMsAvg')
  const p = mean(big, 'matchingMsP95')
  if (a != null && p != null)
    out.push(`Với ${n0(big.doctors)} bác sĩ, Multi-Criteria ghép cặp trung bình ${fms(a)} mỗi yêu cầu (p95 ${fms(p)})${multi.length > 1 && mean(small, 'matchingMsAvg') != null ? `, so với ${fms(mean(small, 'matchingMsAvg')!)} ở ${n0(small.doctors)} bác sĩ` : ''}.`)
  const r = mean(big, 'retrievalMsAvg')
  const f = mean(big, 'fullScanMsAvg')
  if (r != null && f != null && r > 0) out.push(`Truy xuất ứng viên qua chỉ mục lưới mất ${fms(r)} so với ${fms(f)} khi quét toàn bộ, nhanh hơn khoảng ${(f / r).toFixed(1)} lần.`)
  const maxP95 = Math.max(...rows.map((x) => mean(x, 'matchingMsP95') ?? 0))
  out.push(`Ở mọi cấu hình, p95 thời gian ghép cặp không vượt quá ${fms(maxP95)}, rất nhỏ so với thời gian chờ bác sĩ phản hồi (tối đa 30 s).`)
  return out
}

function Exp3({ rows }: { rows: ScaleRow[] }) {
  const sizes = [...new Set(rows.map((r) => r.doctors))].sort((a, b) => a - b)
  const cats = sizes.map(n0)
  const pick = (n: number, a: Algo) => rows.find((r) => r.doctors === n && r.algorithm === a)
  const lineSeries = (k: MetricKey) =>
    ALGOS.filter((a) => rows.some((r) => r.algorithm === a)).map((a) => ({
      name: ALGO[a], type: 'line' as const, color: ALGO_COLOR[a], data: sizes.map((n) => ({ value: mean(pick(n, a), k), sd: pick(n, a)?.[k]?.sd ?? null })),
    }))
  const axisMs = (v: number) => String(Number(v.toFixed(4)))
  const multiRows = sizes.map((n) => pick(n, 'multi'))
  return (
    <>
      <Conclusion lines={conclude3(rows)} />
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-3">
          <p className="text-xs font-semibold text-slate-800">Thời gian ghép cặp trung bình (ms)</p>
          <p className="mb-1 text-[11px] text-slate-500">Trục ngang: số bác sĩ trong hệ thống</p>
          <Chart height={240} option={cartesian({ categories: cats, fmt: fms, axisFmt: axisMs, series: lineSeries('matchingMsAvg') })} />
        </Card>
        <Card className="p-3">
          <p className="text-xs font-semibold text-slate-800">Thời gian ghép cặp p95 (ms)</p>
          <p className="mb-1 text-[11px] text-slate-500">Trục ngang: số bác sĩ trong hệ thống</p>
          <Chart height={240} option={cartesian({ categories: cats, fmt: fms, axisFmt: axisMs, series: lineSeries('matchingMsP95') })} />
        </Card>
        <Card className="p-3">
          <p className="text-xs font-semibold text-slate-800">Truy xuất ứng viên: chỉ mục lưới so với quét toàn bộ (ms)</p>
          <p className="mb-1 text-[11px] text-slate-500">Đo trong lượt chạy Multi-Criteria</p>
          <Chart
            height={240}
            option={cartesian({
              categories: cats,
              fmt: fms,
              axisFmt: axisMs,
              series: [
                { name: 'Chỉ mục lưới', type: 'line', color: PALETTE[2], data: multiRows.map((r) => ({ value: mean(r, 'retrievalMsAvg'), sd: r?.retrievalMsAvg?.sd ?? null })) },
                { name: 'Quét toàn bộ', type: 'line', color: PALETTE[3], data: multiRows.map((r) => ({ value: mean(r, 'fullScanMsAvg'), sd: r?.fullScanMsAvg?.sd ?? null })) },
              ],
            })}
          />
        </Card>
        <Card className="p-3">
          <p className="text-xs font-semibold text-slate-800">Tỷ lệ thành công</p>
          <p className="mb-1 text-[11px] text-slate-500">Trục ngang: số bác sĩ trong hệ thống</p>
          <Chart height={240} option={cartesian({ categories: cats, scale: true, fmt: (v) => pct(v), axisFmt: (v) => `${Math.round(v * 100)}%`, series: lineSeries('successRate') })} />
        </Card>
      </div>
      <ResultTable
        head={['Số bác sĩ', 'Thuật toán']}
        rows={sizes.flatMap((n) =>
          ALGOS.map((a) => pick(n, a))
            .filter((r): r is ScaleRow => !!r)
            .map((r) => ({
              key: `${n}-${r.algorithm}`,
              cells: [<span key="n" className="tabular-nums">{n0(n)}</span>, <span key="a" className="inline-flex items-center gap-2"><Dash color={ALGO_COLOR[r.algorithm]} />{ALGO[r.algorithm]}</span>],
              agg: r as Agg,
            })),
        )}
        metrics={EXP3_TABLE}
        note="Quét toàn bộ chỉ được đo trong lượt chạy Multi-Criteria."
      />
    </>
  )
}

// ───────────────────────── Bảng kết quả ─────────────────────────
function Dash({ color }: { color: string }) {
  return <span className="inline-block h-[3px] w-3 shrink-0 rounded-sm" style={{ background: color }} />
}

function ResultTable({ head, rows, metrics, highlight, note }: { head: string[]; rows: { key: string; cells: React.ReactNode[]; agg: Agg }[]; metrics: MetricKey[]; highlight?: boolean; note?: string }) {
  const best = Object.fromEntries(metrics.map((k) => [k, highlight ? bestIndex(rows.map((r) => r.agg), k) : -1]))
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">Bảng kết quả (trung bình ± độ lệch chuẩn)</h3>
      <TableWrap>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
            {metrics.map((k) => (
              <th key={k} className={`${th} text-right`} title={METRIC[k].desc}>
                {METRIC[k].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              {r.cells.map((c, i) => (
                <td key={i} className={td}>
                  {c}
                </td>
              ))}
              {metrics.map((k) => (
                <MSCell key={k} k={k} v={r.agg[k]} best={best[k] >= 0 && rows[best[k]] === r} />
              ))}
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <p className="mt-1.5 text-xs text-slate-500">
        {highlight && 'Giá trị tốt nhất ở mỗi cột được tô đậm. '}
        Tỷ lệ: độ lệch chuẩn tính theo điểm %. Rê chuột lên tiêu đề cột để xem định nghĩa.{note ? ` ${note}` : ''}
      </p>
    </div>
  )
}

// ───────────────────────── CSV ─────────────────────────
function exportCsv(r: Run) {
  const metricHead = ALL_METRICS.flatMap((k) => [`${METRIC[k].label} (TB)`, `${METRIC[k].label} (SD)`])
  const vals = (a: Agg) => ALL_METRICS.flatMap((k) => [a[k]?.mean ?? '', a[k]?.sd ?? ''])
  let rows: (string | number)[][] = []
  if (r.experiment === 'algorithms') {
    const res = r.results as { rows: Agg[] }
    rows = [['Thuật toán', 'Số lần lặp', ...metricHead], ...res.rows.map((a) => [ALGO[a.algorithm], a.runs, ...vals(a)])]
  } else if (r.experiment === 'weights') {
    const res = r.results as { rows: WeightRow[]; baseline: Agg }
    const w = (x?: Record<string, number>) => ['distance', 'specialty', 'availability', 'rating', 'experience'].map((k) => (x ? x[k] ?? '' : ''))
    rows = [
      ['Cấu hình', 'w_khoảng cách', 'w_chuyên khoa', 'w_sẵn sàng', 'w_đánh giá', 'w_kinh nghiệm', 'Số lần lặp', ...metricHead],
      ['Nearest (mốc)', ...w(), res.baseline.runs, ...vals(res.baseline)],
      ...res.rows.map((a) => [`Multi-Criteria KC ${wLabel(a.distanceWeight)}`, ...w(a.weights), a.runs, ...vals(a)]),
    ]
  } else {
    const res = r.results as { rows: ScaleRow[] }
    rows = [['Số bác sĩ', 'Thuật toán', 'Số lần lặp', ...metricHead], ...res.rows.map((a) => [a.doctors, ALGO[a.algorithm], a.runs, ...vals(a)])]
  }
  const p = r.params as unknown as Record<string, unknown>
  rows.push([], ['Tham số'], ...Object.entries(p).map(([k, v]) => [k, Array.isArray(v) ? v.join(' ') : typeof v === 'object' ? JSON.stringify(v) : String(v)]), ['Thời gian chạy (ms)', r.durationMs], ['Lần chạy', r.id], ['Thời điểm', r.createdAt])
  downloadCsv(`medigo-${r.experiment}-run${r.id}-seed${r.params.seed}.csv`, rows)
}

// ───────────────────────── Mô hình & giả định ─────────────────────────
function ModelSection() {
  const [open, setOpen] = useState(false)
  return (
    <Card className="mt-6 p-0">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left" aria-expanded={open}>
        <span className="text-sm font-semibold text-slate-900">Mô hình và giả định</span>
        <ChevronDown className={cn('h-4 w-4 text-slate-500 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-6 border-t border-slate-100 px-4 py-4 text-sm leading-6 text-slate-700 lg:grid-cols-2">
          <section>
            <h4 className="mb-1 font-semibold text-slate-900">Matching Score (Multi-Criteria)</h4>
            <p className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800">Score = 0.40·Distance + 0.25·Specialty + 0.15·Availability + 0.10·Rating + 0.10·Experience</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>DistanceScore = max(0, 1 − d / R), R là bán kính tìm kiếm.</li>
              <li>SpecialtyScore = 1 nếu đúng chuyên khoa, 0,3 nếu chuyên khoa liên quan, loại nếu khác.</li>
              <li>AvailabilityScore = 1 / 0,6 / 0,3 khi bác sĩ đang có 0 / 1 / ≥ 2 ca.</li>
              <li>RatingScore = trung bình Bayes (n·r + k·C) / (n + k) / 5 với C = 4,0, k = 5, để bác sĩ chỉ có 1 đánh giá 5★ không vượt bác sĩ có 200 đánh giá 4,8★.</li>
              <li>ExperienceScore = min(1, số năm kinh nghiệm / 20).</li>
              <li>Trọng số được chuẩn hóa để tổng bằng 1. Ở thí nghiệm 2, trọng số khoảng cách thay đổi, bốn trọng số còn lại co giãn theo tỷ lệ mặc định.</li>
            </ul>
            <h4 className="mb-1 mt-4 font-semibold text-slate-900">Điều kiện cứng và hai thuật toán đối chứng</h4>
            <ul className="list-disc space-y-1 pl-5">
              <li>Ứng viên phải: online, sẵn sàng, đã được duyệt, số ca đang xử lý nhỏ hơn sức chứa (2), trong bán kính R và hỗ trợ hình thức khám yêu cầu.</li>
              <li>Random: chọn ngẫu nhiên trong các bác sĩ đúng chuyên khoa.</li>
              <li>Nearest: sắp xếp tăng dần theo khoảng cách, đúng chuyên khoa.</li>
              <li>Multi-Criteria: xếp hạng theo Matching Score, đúng chuyên khoa trước, chuyên khoa liên quan làm dự phòng trong Top-5.</li>
              <li>Độ phức tạp: lọc và tính điểm O(n), sắp xếp O(n log n), với n là số bác sĩ quanh bệnh nhân (lấy từ chỉ mục lưới ~1 km).</li>
            </ul>
          </section>
          <section>
            <h4 className="mb-1 font-semibold text-slate-900">Kịch bản mô phỏng</h4>
            <ul className="list-disc space-y-1 pl-5">
              <li>N bác sĩ trong khu vực Đà Nẵng: 70% tập trung quanh 12 cụm phòng khám, 30% phân bố đều.</li>
              <li>M yêu cầu khám ngay đến ngẫu nhiên trong khung T phút (xấp xỉ quá trình Poisson); 50% khám online, 50% trực tiếp.</li>
              <li>Mỗi bác sĩ có chất lượng thật q ∈ [3,4; 5]; rating quan sát = q + nhiễu giảm dần theo số đánh giá.</li>
              <li>Mỗi yêu cầu gửi lời mời tuần tự cho Top-5 ứng viên.</li>
            </ul>
            <h4 className="mb-1 mt-4 font-semibold text-slate-900">Mô hình hành vi (giả định)</h4>
            <p className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800">P(accept) = r_i × f_dist(d) × f_load(load)</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>r_i: độ sẵn lòng nhận ca của bác sĩ, tương quan một phần với chất lượng theo hệ số ρ.</li>
              <li>f_dist = exp(−d/8) khi khám trực tiếp, exp(−d/25) khi khám online.</li>
              <li>f_load = 1 / 0,7 / 0,4 khi bác sĩ đang có 0 / 1 / 2 ca.</li>
              <li>10% lời mời không được phản hồi và hết hạn sau 30 s (tự động từ chối).</li>
              <li>Bệnh nhân bỏ cuộc nếu tổng thời gian chờ vượt 150 s.</li>
              <li>Ca khám kéo dài 20–40 phút (online) hoặc 30–60 phút cộng thời gian di chuyển (trực tiếp).</li>
            </ul>
            <h4 className="mb-1 mt-4 font-semibold text-slate-900">Độ hài lòng (thang 1–5)</h4>
            <p className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800">S = 1 + 4 × (0.35·q̂ + 0.25·spec + 0.20·distScore + 0.20·waitScore)</p>
            <p className="mt-1">q̂ = (q − 1)/4; spec = 1 nếu đúng chuyên khoa, 0,5 nếu liên quan; waitScore = max(0, 1 − wait/150); distScore = max(0, 1 − d/10) khi trực tiếp, max(0, 1 − d/30) khi online.</p>
          </section>
          <section className="lg:col-span-2">
            <h4 className="mb-1 font-semibold text-slate-900">Định nghĩa chỉ số</h4>
            <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {ALL_METRICS.map((k) => (
                <div key={k}>
                  <dt className="inline font-medium text-slate-900">{METRIC[k].label}: </dt>
                  <dd className="inline">{METRIC[k].desc}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </Card>
  )
}
