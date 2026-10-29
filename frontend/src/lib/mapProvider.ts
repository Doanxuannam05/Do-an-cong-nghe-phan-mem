/**
 * Map Provider – lớp trừu tượng để đổi nhà cung cấp bản đồ (OpenStreetMap / Mapbox / Google).
 * Component MapView chỉ phụ thuộc interface này. Để chuyển sang Mapbox: thêm provider với
 * tileUrl `https://api.mapbox.com/styles/v1/{style}/tiles/{z}/{x}/{y}?access_token=…` và đổi ACTIVE.
 */
export interface MapProvider {
  id: string
  name: string
  tileUrl: string
  attribution: string
  maxZoom: number
}

export const PROVIDERS: Record<string, MapProvider> = {
  osm: {
    id: 'osm',
    name: 'OpenStreetMap',
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  cartoLight: {
    id: 'cartoLight',
    name: 'CARTO Positron (dữ liệu OSM)',
    tileUrl: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 20,
  },
}

export const ACTIVE_PROVIDER = PROVIDERS.cartoLight
