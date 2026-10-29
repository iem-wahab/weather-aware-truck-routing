import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { mapboxToken, miles, timeLabel } from '../api'
import type { Corridor, Plan, Route } from '../types'

type Props = { plan: Plan | null; selectedId: string | null; corridor: Corridor | null; offset: number; onSelect: (id: string) => void }
const palette: Record<string, string> = { Low: '#4c9c79', Moderate: '#e7ad45', High: '#e7804e', Severe: '#cf534b', 'No Travel': '#803d57', Unknown: '#9ba7a5' }
const routeColor = ['match', ['get', 'id'], 'route-1', '#305f75', 'route-2', '#8c729d', 'route-3', '#c28643', '#4e7080'] as mapboxgl.Expression
const empty = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection

function routeFeatures(routes: Route[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: routes.map(route => ({ type: 'Feature', properties: { id: route.id, name: route.name }, geometry: route.geometry })) as GeoJSON.Feature[] }
}
function checkpointFeatures(plan: Plan): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: plan.routes.flatMap(route => route.checkpoints.map(point => ({ type: 'Feature', properties: { routeId: route.id, routeName: route.name, distance: miles(point.distance_m), eta: point.eta_utc, wind: point.wind_mph, rain: point.rain_in_h, snow: point.snow_in_h, risk: point.risk || 'Unknown', condition: point.condition }, geometry: { type: 'Point', coordinates: point.coordinate } }))) as GeoJSON.Feature[] }
}
function heatFeatures(plan: Plan, corridor: Corridor | null, offset: number): GeoJSON.FeatureCollection {
  if (!corridor) return empty
  return { type: 'FeatureCollection', features: plan.corridor_coordinates.flatMap((point, index) => {
    const score = corridor.risk_frames[offset]?.[index]
    return score == null ? [] : [{ type: 'Feature', properties: { score }, geometry: { type: 'Point', coordinates: point } }]
  }) as GeoJSON.Feature[] }
}
function updateSource(map: mapboxgl.Map, id: string, data: GeoJSON.FeatureCollection) {
  const source = map.getSource(id) as mapboxgl.GeoJSONSource | undefined
  source?.setData(data)
}
function fitTrip(map: mapboxgl.Map, plan: Plan, duration: number) {
  const bounds = new mapboxgl.LngLatBounds()
  plan.routes.forEach(route => route.geometry.coordinates.forEach(point => bounds.extend(point)))
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 52, maxZoom: 10, duration })
}
function popupContent(properties: Record<string, unknown>) {
  const root = document.createElement('div'); root.className = 'checkpoint-popup'
  const title = document.createElement('strong'); title.textContent = String(properties.routeName); root.append(title)
  const row = (label: string, value: string) => { const p = document.createElement('p'); const b = document.createElement('b'); b.textContent = label; p.append(b, document.createTextNode(` ${value}`)); root.append(p) }
  const measure = (value: unknown, digits: number, unit: string) => value == null ? 'Unknown' : `${Number(value).toFixed(digits)} ${unit}`
  row('Checkpoint', `${Number(properties.distance).toFixed(1)} mi along route`)
  row('ETA', timeLabel(String(properties.eta)))
  row('Wind', measure(properties.wind, 1, 'mph'))
  row('Rain', measure(properties.rain, 2, 'in/h'))
  row('Snow', measure(properties.snow, 2, 'in/h'))
  row('Overall risk', String(properties.risk))
  row('Contributing condition', String(properties.condition))
  return root
}
export function RouteMap({ plan, selectedId, corridor, offset, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const onSelectRef = useRef(onSelect)
  const latest = useRef({ plan, selectedId, corridor, offset })
  const [ready, setReady] = useState(false)
  onSelectRef.current = onSelect
  latest.current = { plan, selectedId, corridor, offset }
  useEffect(() => {
    if (!container.current || !mapboxToken) return
    mapboxgl.accessToken = mapboxToken
    const map = new mapboxgl.Map({ container: container.current, style: 'mapbox://styles/mapbox/light-v11', center: [-96, 38], zoom: 3.4 })
    mapRef.current = map
    const observer = new ResizeObserver(() => {
      map.resize()
      if (latest.current.plan && map.isStyleLoaded()) fitTrip(map, latest.current.plan, 0)
    })
    observer.observe(container.current)
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('load', () => {
      map.addSource('heat', { type: 'geojson', data: empty })
      map.addSource('routes', { type: 'geojson', data: empty })
      map.addSource('selected-route', { type: 'geojson', data: empty })
      map.addSource('checkpoints', { type: 'geojson', data: empty })
      map.addLayer({ id: 'forecast-risk', type: 'heatmap', source: 'heat', paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'score'], 0, .06, 1, .25, 2, .5, 3, .75, 4, 1],
        'heatmap-intensity': .8, 'heatmap-radius': 38, 'heatmap-opacity': .58,
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(76,156,121,0)', .2, '#80b99c', .4, '#e4b768', .6, '#e88a5c', .8, '#cc574f', 1, '#803d57'],
      } })
      map.addLayer({ id: 'route-halo', type: 'line', source: 'selected-route', paint: { 'line-color': '#ffffff', 'line-width': 11, 'line-opacity': .95 }, layout: { 'line-join': 'round', 'line-cap': 'round' } })
      map.addLayer({ id: 'route-lines', type: 'line', source: 'routes', paint: { 'line-color': routeColor, 'line-width': 4, 'line-opacity': .78 }, layout: { 'line-join': 'round', 'line-cap': 'round' } })
      map.addLayer({ id: 'selected-line', type: 'line', source: 'selected-route', paint: { 'line-color': routeColor, 'line-width': 6 }, layout: { 'line-join': 'round', 'line-cap': 'round' } })
      map.addLayer({ id: 'route-hit', type: 'line', source: 'routes', paint: { 'line-color': '#000000', 'line-width': 20, 'line-opacity': 0 } })
      map.addLayer({ id: 'checkpoint-circles', type: 'circle', source: 'checkpoints', paint: {
        'circle-color': ['match', ['get', 'risk'], ...Object.entries(palette).flat(), '#9ba7a5'] as mapboxgl.Expression,
        'circle-radius': ['case', ['==', ['get', 'routeId'], ['literal', latest.current.selectedId || '']], 7, 5],
        'circle-stroke-color': '#ffffff', 'circle-stroke-width': ['case', ['==', ['get', 'routeId'], ['literal', latest.current.selectedId || '']], 2.5, 1.5],
        'circle-opacity': .98,
      } })
      map.on('click', 'route-hit', event => { const id = event.features?.[0]?.properties?.id; if (id) onSelectRef.current(String(id)) })
      map.on('click', 'checkpoint-circles', event => {
        const feature = event.features?.[0]
        if (!feature || feature.geometry.type !== 'Point') return
        const id = feature.properties?.routeId
        if (id) onSelectRef.current(String(id))
        popupRef.current?.remove()
        popupRef.current = new mapboxgl.Popup({ offset: 12, maxWidth: '260px' }).setLngLat(feature.geometry.coordinates as [number, number]).setDOMContent(popupContent(feature.properties || {})).addTo(map)
      })
      for (const layer of ['route-hit', 'checkpoint-circles']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
      }
      setReady(true)
    })
    return () => { observer.disconnect(); popupRef.current?.remove(); map.remove(); mapRef.current = null; setReady(false) }
  }, [])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (!plan) {
      popupRef.current?.remove(); popupRef.current = null
      for (const id of ['heat', 'routes', 'selected-route', 'checkpoints']) updateSource(map, id, empty)
      return
    }
    updateSource(map, 'routes', routeFeatures(plan.routes))
    updateSource(map, 'checkpoints', checkpointFeatures(plan))
    fitTrip(map, plan, 850)
  }, [plan, ready])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const selected = plan?.routes.find(route => route.id === selectedId)
    updateSource(map, 'selected-route', selected ? routeFeatures([selected]) : empty)
    map.setPaintProperty('checkpoint-circles', 'circle-radius', ['case', ['==', ['get', 'routeId'], selectedId || ''], 7, 5])
    map.setPaintProperty('checkpoint-circles', 'circle-stroke-width', ['case', ['==', ['get', 'routeId'], selectedId || ''], 2.5, 1.5])
  }, [plan, selectedId, ready])
  useEffect(() => { const map = mapRef.current; if (map && ready) updateSource(map, 'heat', plan ? heatFeatures(plan, corridor, offset) : empty) }, [plan, corridor, offset, ready])
  return <div className="map-wrap"><div className="map-canvas" ref={container}/>{!mapboxToken && <div className="map-overlay error-text">Set VITE_MAPBOX_ACCESS_TOKEN to load the map.</div>}{!plan && mapboxToken && <div className="map-overlay map-empty"><span className="map-empty-icon">↗</span><strong>Your route starts here</strong><small>Set a trip to see road options and weather risk.</small></div>}</div>
}
