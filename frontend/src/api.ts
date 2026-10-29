import type { Coord, Corridor, Plan } from './types'
const TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined
export const mapboxToken = TOKEN || ''

async function post<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  let response: Response
  const timeout = AbortSignal.timeout(120000)
  try { response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.any([signal, timeout]) }) }
  catch (error) { if (signal.aborted) throw error; if (timeout.aborted) throw new Error('The routing request timed out. Please retry.'); throw new Error('Cannot reach the routing server. Check that Django is running on port 8000.') }
  let data: { error?: string }
  try { data = await response.json() } catch { throw new Error(`The server returned an invalid response (${response.status}).`) }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`)
  return data as T
}
export function getPlan(body: { origin: Coord; destination: Coord; departure_utc: string; load_lb: number; interval_miles: number }, signal: AbortSignal) { return post<Plan>('/api/plan/', body, signal) }
export function getCorridor(plan: Plan, signal: AbortSignal) { return post<Corridor>('/api/corridor-weather/', { coordinates: plan.corridor_coordinates, forecast_window: plan.forecast_window, departure_utc: plan.departure_utc, load_lb: plan.load_lb }, signal) }
export async function geocode(query: string, signal: AbortSignal): Promise<{ label: string; coordinate: Coord }[]> {
  if (!TOKEN) throw new Error('Set VITE_MAPBOX_ACCESS_TOKEN in frontend/.env to search locations.')
  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward')
  url.searchParams.set('q', query); url.searchParams.set('limit', '5'); url.searchParams.set('autocomplete', 'true'); url.searchParams.set('access_token', TOKEN)
  let response: Response
  const timeout = AbortSignal.timeout(10000)
  try { response = await fetch(url, { signal: AbortSignal.any([signal, timeout]) }) }
  catch (error) { if (signal.aborted) throw error; if (timeout.aborted) throw new Error('Location search timed out. Try again.'); throw new Error('Location search is unavailable. Check your connection.') }
  if (!response.ok) throw new Error(`Location search failed (${response.status}). Check your Mapbox token.`)
  const data = await response.json() as { features?: { properties?: { full_address?: string; name_preferred?: string; place_formatted?: string }; geometry?: { coordinates?: Coord } }[] }
  return (data.features || []).filter(feature => feature.geometry?.coordinates).map(feature => ({ label: feature.properties?.full_address || [feature.properties?.name_preferred, feature.properties?.place_formatted].filter(Boolean).join(', ') || 'Unnamed location', coordinate: feature.geometry!.coordinates! }))
}
export const miles = (meters: number) => meters / 1609.344
export const timeLabel = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
export const durationLabel = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.round(seconds % 3600 / 60)}m`
