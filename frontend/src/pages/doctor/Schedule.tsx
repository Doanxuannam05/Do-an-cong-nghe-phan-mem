import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { errorMessage, get, patch, put } from '@/lib/http'
import { DOW, day, time, vnDateKey } from '@/lib/format'
import { HeaderActions } from '@/components/layouts'
import { Btn, Card, Empty, ErrorBox, PageHeader, SectionTitle, Spinner, inputCls } from '@/components/kit'
import { cn } from '@/lib/utils'
import { LOAD_ERROR } from './common'

interface ScheduleItem {
  id?: number
  dayOfWeek: number
  startTime: string
  endTime: string
  slotMinutes: number
}
interface Slot {
  id: number
  start_at: string
  end_at: string
  status: 'AVAILABLE' | 'BOOKED' | 'BLOCKED'
  booking_id: number | null
  code: string | null
  booking_status: string | null
  consultation_type?: string | null
  patient_name: string | null
}

/** Thứ 2 → Chủ nhật */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const SLOT_OPTIONS = [15, 20, 30, 45, 60]

let tmpKey = 0
type Row = ScheduleItem & { key: number }
const withKey = (x: ScheduleItem): Row => ({ ...x, key: ++tmpKey })

function validate(rows: Row[]): string | null {
  for (const r of rows) {
    if (!/^\d{2}:\d{2}$/.test(r.startTime) || !/^\d{2}:\d{2}$/.test(r.endTime)) return `Giờ chưa hợp lệ vào ${DOW[r.dayOfWeek]}`
    if (r.startTime >= r.endTime) return `Giờ bắt đầu phải trước giờ kết thúc (${DOW[r.dayOfWeek]})`
  }
  for (let d = 0; d < 7; d++) {
    const list = rows.filter((r) => r.dayOfWeek === d).sort((a, b) => a.startTime.localeCompare(b.startTime))
    for (let i = 1; i < list.length; i++) if (list[i].startTime < list[i - 1].endTime) return `Khung giờ bị chồng lấn vào ${DOW[d]}`
  }
  return null
}

export default function SchedulePage() {
  const qc = useQueryClient()
  const sched = useQuery({ queryKey: ['doctor-schedule'], queryFn: () => get<ScheduleItem[]>('schedules/me'), staleTime: 5 * 60_000 })
  const slots = useQuery({ queryKey: ['doctor-slots'], queryFn: () => get<Slot[]>('schedules/me/slots?days=7'), staleTime: 60_000 })

  const [rows, setRows] = useState<Row[] | null>(null)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (sched.data && !dirty) setRows(sched.data.map(withKey))
  }, [sched.data, dirty])

  const update = (fn: (r: Row[]) => Row[]) => {
    setRows((r) => fn(r || []))
    setDirty(true)
  }

  const save = useMutation({
    mutationFn: (items: ScheduleItem[]) => put<{ ok: boolean; slotsCreated: number }>('schedules/me', { items }),
    onSuccess: async (r) => {
      toast.success(`Đã lưu lịch làm việc${r.slotsCreated ? ` · tạo ${r.slotsCreated} slot mới` : ''}`)
      setDirty(false)
      await Promise.all([qc.invalidateQueries({ queryKey: ['doctor-schedule'] }), qc.invalidateQueries({ queryKey: ['doctor-slots'] })])
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const onSave = () => {
    if (!rows) return
    const err = validate(rows)
    if (err) return toast.error(err)
    save.mutate(rows.map(({ dayOfWeek, startTime, endTime, slotMinutes }) => ({ dayOfWeek, startTime, endTime, slotMinutes })))
  }

  return (
    <div>
      <PageHeader title="Lịch làm việc" subtitle="Khung giờ nhận đặt lịch hằng tuần" right={<HeaderActions notificationsPath="/d/notifications" />} />
      <div className="px-4 pb-6 pt-4">
        <Link to="/d/bookings" className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:border-teal-300">
          Tất cả lịch khám
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </Link>

        <SectionTitle>Lịch tuần</SectionTitle>
        {sched.isLoading || (!rows && !sched.isError) ? (
          <Spinner />
        ) : sched.isError ? (
          <ErrorBox message={LOAD_ERROR} onRetry={() => sched.refetch()} />
        ) : (
          <>
            <div className="space-y-2">
              {DAY_ORDER.map((d) => {
                const list = (rows || []).filter((r) => r.dayOfWeek === d).sort((a, b) => a.startTime.localeCompare(b.startTime))
                return (
                  <Card key={d} className="p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">{DOW[d]}</p>
                      <button
                        type="button"
                        onClick={() => {
                          const last = list[list.length - 1]
                          const start = last ? last.endTime : '08:00'
                          const h = Math.min(23, Number(start.slice(0, 2)) + 2)
                          const end = h >= 23 ? '23:30' : `${String(h).padStart(2, '0')}:${start.slice(3)}`
                          update((r) => [...r, withKey({ dayOfWeek: d, startTime: start, endTime: end > start ? end : '23:59', slotMinutes: last?.slotMinutes || 30 })])
                        }}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-teal-700 hover:bg-teal-50"
                      >
                        <Plus className="h-4 w-4" /> Thêm ca
                      </button>
                    </div>
                    {!list.length ? (
                      <p className="mt-1 text-xs text-slate-500">Nghỉ</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {list.map((r) => (
                          <div key={r.key} className="flex items-center gap-1.5">
                            <input
                              type="time"
                              aria-label="Giờ bắt đầu"
                              value={r.startTime}
                              onChange={(e) => update((all) => all.map((x) => (x.key === r.key ? { ...x, startTime: e.target.value } : x)))}
                              className={cn(inputCls, 'min-w-0 flex-1 px-2 py-2')}
                            />
                            <span className="text-slate-400">–</span>
                            <input
                              type="time"
                              aria-label="Giờ kết thúc"
                              value={r.endTime}
                              onChange={(e) => update((all) => all.map((x) => (x.key === r.key ? { ...x, endTime: e.target.value } : x)))}
                              className={cn(inputCls, 'min-w-0 flex-1 px-2 py-2')}
                            />
                            <select
                              aria-label="Độ dài slot"
                              value={r.slotMinutes}
                              onChange={(e) => update((all) => all.map((x) => (x.key === r.key ? { ...x, slotMinutes: Number(e.target.value) } : x)))}
                              className={cn(inputCls, 'w-[76px] shrink-0 px-2 py-2')}
                            >
                              {SLOT_OPTIONS.map((m) => (
                                <option key={m} value={m}>
                                  {m} ph
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              aria-label="Xóa ca"
                              onClick={() => update((all) => all.filter((x) => x.key !== r.key))}
                              className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
            <div className="mt-3 flex gap-2">
              {dirty && (
                <Btn variant="outline" className="flex-1" disabled={save.isPending} onClick={() => setDirty(false)}>
                  Hoàn tác
                </Btn>
              )}
              <Btn className="flex-1" loading={save.isPending} disabled={!dirty} onClick={onSave}>
                Lưu lịch tuần
              </Btn>
            </div>
            <p className="mt-2 text-xs text-slate-500">Khi lưu, hệ thống tạo lại các slot trống; slot đã có người đặt được giữ nguyên.</p>
          </>
        )}

        <SectionTitle>Slot 7 ngày tới</SectionTitle>
        <p className="-mt-1 mb-2 text-xs text-slate-500">Chạm vào slot trống để khóa, chạm lần nữa để mở lại.</p>
        {slots.isLoading ? (
          <Spinner />
        ) : slots.isError ? (
          <ErrorBox message={LOAD_ERROR} onRetry={() => slots.refetch()} />
        ) : !slots.data?.length ? (
          <Empty title="Chưa có slot nào" hint="Thêm khung giờ vào lịch tuần rồi bấm lưu để tạo slot." />
        ) : (
          <SlotDays slots={slots.data} />
        )}
      </div>
    </div>
  )
}

function SlotDays({ slots }: { slots: Slot[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, Slot[]>()
    for (const s of slots) {
      const k = vnDateKey(s.start_at)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    return [...m.entries()]
  }, [slots])
  const today = vnDateKey(new Date())
  const [open, setOpen] = useState<string | null>(groups[0]?.[0] ?? null)

  return (
    <div className="space-y-2">
      {groups.map(([k, list]) => {
        const booked = list.filter((s) => s.status === 'BOOKED').length
        const free = list.filter((s) => s.status === 'AVAILABLE' && new Date(s.start_at) > new Date()).length
        const isOpen = open === k
        return (
          <div key={k} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button type="button" onClick={() => setOpen(isOpen ? null : k)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
              <div>
                <p className="text-sm font-semibold capitalize text-slate-900">
                  {k === today ? 'Hôm nay · ' : ''}
                  {day(list[0].start_at)}
                </p>
                <p className="text-xs text-slate-500">
                  {booked} đã đặt · {free} còn trống
                </p>
              </div>
              <ChevronDown className={cn('h-4 w-4 text-slate-400 transition', isOpen && 'rotate-180')} />
            </button>
            {isOpen && (
              <div className="border-t border-slate-100 px-4 py-3">
                <div className="grid grid-cols-4 gap-2">
                  {list.map((s) => (
                    <SlotChip key={s.id} s={s} />
                  ))}
                </div>
                {list.some((s) => s.status === 'BOOKED') && (
                  <div className="mt-3 space-y-1">
                    {list
                      .filter((s) => s.status === 'BOOKED' && s.booking_id)
                      .map((s) => (
                        <Link key={s.id} to={`/d/bookings/${s.booking_id}`} className="flex items-center justify-between gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sm hover:bg-sky-100">
                          <span className="min-w-0 truncate">
                            <span className="font-semibold tabular-nums text-sky-900">{time(s.start_at)}</span>
                            <span className="text-slate-700"> · {s.patient_name || s.code}</span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-sky-700" />
                        </Link>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
      <div className="flex flex-wrap gap-3 pt-1 text-xs text-slate-500">
        <Legend cls="border-teal-200 bg-white" label="Trống" />
        <Legend cls="border-sky-200 bg-sky-50" label="Đã đặt" />
        <Legend cls="border-slate-200 bg-slate-100" label="Đã khóa" />
      </div>
    </div>
  )
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-3 w-3 rounded border', cls)} />
      {label}
    </span>
  )
}

function SlotChip({ s }: { s: Slot }) {
  const qc = useQueryClient()
  const past = new Date(s.start_at) <= new Date()
  const toggle = useMutation({
    mutationFn: (status: 'AVAILABLE' | 'BLOCKED') => patch<{ id: number; status: Slot['status'] }>(`schedules/slots/${s.id}`, { status }),
    onSuccess: (r) => qc.setQueryData<Slot[]>(['doctor-slots'], (old) => old?.map((x) => (x.id === s.id ? { ...x, status: r.status } : x))),
    onError: (e) => {
      toast.error(errorMessage(e))
      qc.invalidateQueries({ queryKey: ['doctor-slots'] })
    },
  })

  if (s.status === 'BOOKED') {
    return s.booking_id ? (
      <Link to={`/d/bookings/${s.booking_id}`} title={s.patient_name || undefined} className="rounded-lg border border-sky-200 bg-sky-50 py-2 text-center text-sm font-medium tabular-nums text-sky-900">
        {time(s.start_at)}
      </Link>
    ) : (
      <span className="rounded-lg border border-sky-200 bg-sky-50 py-2 text-center text-sm font-medium tabular-nums text-sky-900">{time(s.start_at)}</span>
    )
  }
  const blocked = s.status === 'BLOCKED'
  return (
    <button
      type="button"
      disabled={past || toggle.isPending}
      onClick={() => toggle.mutate(blocked ? 'AVAILABLE' : 'BLOCKED')}
      aria-label={`${time(s.start_at)} – ${blocked ? 'đã khóa, chạm để mở' : 'trống, chạm để khóa'}`}
      className={cn(
        'rounded-lg border py-2 text-center text-sm tabular-nums transition disabled:cursor-not-allowed',
        past ? 'border-slate-100 bg-slate-50 text-slate-300' : blocked ? 'border-slate-200 bg-slate-100 text-slate-400 line-through' : 'border-teal-200 bg-white text-teal-800 hover:bg-teal-50',
        toggle.isPending && 'opacity-50',
      )}
    >
      {time(s.start_at)}
    </button>
  )
}
