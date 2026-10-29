import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Sparkles, Zap } from 'lucide-react'
import { errorMessage, post } from '@/lib/http'
import { useMyLocation, type Doctor } from '@/lib/hooks'
import { Btn, Card, DoctorCard, inputCls, PageHeader, SectionTitle, SpecialtyIcon } from '@/components/kit'

interface Suggestion {
  specialty: { id: number; name: string; slug: string; icon: string } | null
  confidence: number
  fallback: boolean
  matchedKeywords: string[]
  alternatives: { slug: string; confidence: number; specialty: { id: number; name: string } | null }[]
  emergency: boolean
  emergencyMessage: string | null
  doctors: Doctor[]
  disclaimer: string
  method: string
  elapsedMs: number
}

const EXAMPLES = ['Tôi bị đau họng và sốt', 'Bé nhà tôi 2 tuổi ho và sổ mũi', 'Nổi mẩn đỏ, ngứa ở cánh tay', 'Đau răng hàm dưới khi ăn đồ lạnh', 'Hay đau đầu, chóng mặt, mất ngủ', 'Mắt đỏ, cay và chảy nước mắt']

/** Gợi ý chuyên khoa từ triệu chứng – chỉ gợi ý chuyên khoa, không chẩn đoán */
export default function Symptom() {
  const nav = useNavigate()
  const loc = useMyLocation()
  const [text, setText] = useState('')
  const m = useMutation({
    mutationFn: (t: string) => post<Suggestion>('ai/suggest-specialty', { text: t, lat: loc.location.lat, lng: loc.location.lng }),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const r = m.data

  return (
    <div>
      <PageHeader title="Gợi ý chuyên khoa" subtitle="Mô tả triệu chứng bằng lời của bạn" back />
      <div className="space-y-3 p-4">
        <Card>
          <textarea className={inputCls} rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ví dụ: Tôi bị đau họng và sốt từ hôm qua" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((x) => (
              <button key={x} onClick={() => { setText(x); m.mutate(x) }} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-teal-50">
                {x}
              </button>
            ))}
          </div>
          <Btn className="mt-3 w-full" disabled={text.trim().length < 3} loading={m.isPending} onClick={() => m.mutate(text)}>
            <Sparkles className="h-4 w-4" /> Gợi ý chuyên khoa
          </Btn>
        </Card>

        {r && (
          <>
            {r.emergency && (
              <div className="flex gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-900">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Có dấu hiệu cần cấp cứu</p>
                  <p className="text-sm">{r.emergencyMessage}</p>
                  <a href="tel:115" className="mt-2 inline-block rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white">Gọi 115</a>
                </div>
              </div>
            )}
            {r.specialty && (
              <Card>
                <p className="text-xs font-medium text-slate-500">Chuyên khoa gợi ý</p>
                <div className="mt-2 flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                    <SpecialtyIcon icon={r.specialty.icon} className="h-6 w-6" />
                  </span>
                  <div className="flex-1">
                    <p className="text-lg font-semibold text-slate-900">{r.specialty.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.round(r.confidence * 100)}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-600">{Math.round(r.confidence * 100)}%</span>
                    </div>
                  </div>
                </div>
                {r.fallback ? (
                  <p className="mt-3 text-sm text-slate-600">Chưa nhận diện được triệu chứng cụ thể – bác sĩ Nội khoa có thể khám tổng quát và tư vấn chuyển chuyên khoa phù hợp.</p>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">Từ khóa nhận diện: {r.matchedKeywords.map((k) => <span key={k} className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{k}</span>)}</p>
                )}
                {r.alternatives.length > 0 && (
                  <p className="mt-2 text-sm text-slate-500">
                    Cũng có thể: {r.alternatives.map((a) => `${a.specialty?.name} (${Math.round(a.confidence * 100)}%)`).join(', ')}
                  </p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Btn variant="outline" onClick={() => nav(`/p/search?specialtyId=${r.specialty!.id}`)}>Xem bác sĩ</Btn>
                  <Btn onClick={() => nav(`/p/request?specialtyId=${r.specialty!.id}&symptoms=${encodeURIComponent(text)}`)}><Zap className="h-4 w-4" /> Khám ngay</Btn>
                </div>
              </Card>
            )}
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">{r.disclaimer}</p>
            {r.doctors.length > 0 && (
              <>
                <SectionTitle>Top {r.doctors.length} bác sĩ đề xuất gần bạn</SectionTitle>
                <div className="space-y-2">
                  {r.doctors.map((d) => <DoctorCard key={d.id} d={d} compact onClick={() => nav(`/p/doctors/${d.id}`)} />)}
                </div>
              </>
            )}
            <p className="text-center text-[11px] text-slate-400">{r.method} · {r.elapsedMs.toFixed(1)} ms</p>
          </>
        )}
      </div>
    </div>
  )
}
