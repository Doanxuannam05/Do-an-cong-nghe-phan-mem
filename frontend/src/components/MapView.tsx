import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ACTIVE_PROVIDER } from '@/lib/mapProvider'
import type { LatLng } from '@/lib/location'

export interface MapMarker {
  id: string | number
  lat: number
  lng: number
  kind: 'doctor' | 'doctor-off' | 'clinic' | 'patient' | 'highlight'
  label?: string
  onClick?: () => void
}

interface Props {
  center: LatLng
  markers?: MapMarker[]
  radiusKm?: number | null
  zoom?: number
  className?: string
  onPick?: (p: LatLng) => void
  fitMarkers?: boolean
  selectedId?: string | number | null
  /** Hiện chấm vị trí người dùng tại center (mặc định: có) */
  showCenter?: boolean
}

const COLORS: Record<MapMarker['kind'], string> = {
  doctor: '#0f766e',
  'doctor-off': '#94a3b8',
  clinic: '#7c3aed',
  patient: '#2563eb',
  highlight: '#ea580c',
}

function icon(kind: MapMarker['kind'], selected: boolean) {
  const c = COLORS[kind]
  if (kind === 'patient') {
    return L.divIcon({
      className: '',
      html: `<div style="position:relative;width:22px;height:22px"><span style="position:absolute;inset:0;border-radius:9999px;background:${c};opacity:.25;animation:mgpulse 2s infinite"></span><span style="position:absolute;inset:5px;border-radius:9999px;background:${c};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></span></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    })
  }
  const size = selected ? 34 : kind === 'clinic' ? 22 : 28
  const glyph = kind === 'clinic'
    ? '<path d="M10 4v12M4 10h12" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'
    : '<circle cx="10" cy="8" r="3.2" fill="#fff"/><path d="M4.5 16.5c.9-3 3-4.5 5.5-4.5s4.6 1.5 5.5 4.5" fill="#fff"/>'
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${c};border:2px solid #fff;box-shadow:0 2px 6px rgba(15,23,42,.35);display:flex;align-items:center;justify-content:center;${selected ? 'outline:3px solid rgba(234,88,12,.35)' : ''}"><svg width="${size * 0.6}" height="${size * 0.6}" viewBox="0 0 20 20">${glyph}</svg></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/** Bản đồ Leaflet + tile từ Map Provider đang chọn */
export default function MapView({ center, markers = [], radiusKm, zoom = 14, className, onPick, fitMarkers, selectedId, showCenter = true }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const pickRef = useRef(onPick)
  pickRef.current = onPick

  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([center.lat, center.lng], zoom)
    L.tileLayer(ACTIVE_PROVIDER.tileUrl, { attribution: ACTIVE_PROVIDER.attribution, maxZoom: ACTIVE_PROVIDER.maxZoom }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => pickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }))
    map.current = m
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(el.current)
    if (!document.getElementById('mg-map-style')) {
      const s = document.createElement('style')
      s.id = 'mg-map-style'
      s.textContent = '@keyframes mgpulse{0%{transform:scale(1);opacity:.35}70%{transform:scale(2.4);opacity:0}100%{opacity:0}}.leaflet-container{font-family:inherit}'
      document.head.appendChild(s)
    }
    return () => {
      ro.disconnect()
      m.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const m = map.current
    const g = layer.current
    if (!m || !g) return
    g.clearLayers()
    if (radiusKm) L.circle([center.lat, center.lng], { radius: radiusKm * 1000, color: '#0f766e', weight: 1.5, fillColor: '#14b8a6', fillOpacity: 0.06, dashArray: '4 4' }).addTo(g)
    if (showCenter) L.marker([center.lat, center.lng], { icon: icon('patient', false), zIndexOffset: 1000 }).addTo(g)
    for (const mk of markers) {
      const marker = L.marker([mk.lat, mk.lng], { icon: icon(mk.kind, mk.id === selectedId), zIndexOffset: mk.id === selectedId ? 900 : 0 }).addTo(g)
      if (mk.label) marker.bindTooltip(mk.label, { direction: 'top', offset: [0, -14] })
      if (mk.onClick) marker.on('click', mk.onClick)
    }
  }, [center.lat, center.lng, markers, radiusKm, selectedId, showCenter])

  useEffect(() => {
    const m = map.current
    if (!m) return
    if (fitMarkers && markers.length) {
      const b = L.latLngBounds([...(showCenter ? [[center.lat, center.lng] as [number, number]] : []), ...markers.map((x) => [x.lat, x.lng] as [number, number])])
      m.fitBounds(b, { padding: [40, 40], maxZoom: 15 })
    } else if (radiusKm) {
      m.fitBounds(L.latLng(center.lat, center.lng).toBounds(radiusKm * 2000), { padding: [16, 16] })
    } else {
      m.setView([center.lat, center.lng], m.getZoom())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, radiusKm, fitMarkers])

  return <div ref={el} className={className} style={{ zIndex: 0 }} />
}
