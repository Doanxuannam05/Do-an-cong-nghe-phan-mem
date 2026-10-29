import { Crosshair, Loader2, MapPin } from 'lucide-react'
import type { useMyLocation } from '@/lib/hooks'

/** Thanh vị trí hiện tại + nút định vị GPS */
export default function LocationBar({ loc, compact }: { loc: ReturnType<typeof useMyLocation>; compact?: boolean }) {
  return (
    <div>
      <div className={`flex items-center gap-2 rounded-xl bg-white ${compact ? 'px-3 py-2' : 'px-3 py-2.5'} ring-1 ring-slate-200`}>
        <MapPin className="h-4 w-4 shrink-0 text-teal-700" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{loc.label}</p>
          {!compact && (
            <p className="text-xs tabular-nums text-slate-500">
              {loc.location.lat.toFixed(4)}, {loc.location.lng.toFixed(4)}
            </p>
          )}
        </div>
        <button onClick={loc.locate} disabled={loc.locating} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50">
          {loc.locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
          GPS
        </button>
      </div>
      {loc.error && <p className="mt-1 text-xs text-amber-700">{loc.error}</p>}
    </div>
  )
}
