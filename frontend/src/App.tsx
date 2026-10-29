import { useEffect, useRef, useState } from 'react'
import { getCorridor, getPlan, mapboxToken } from './api'
import { TripForm } from './components/TripForm'
import { RouteCards } from './components/RouteCards'
import { RouteMap } from './components/RouteMap'
import { ForecastSlider } from './components/ForecastSlider'
import type { Corridor, Plan, Trip } from './types'

function defaultDeparture() {
  const date = new Date(Date.now() + 60 * 60000)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}
const initialTrip: Trip = { origin: { label: '', coordinate: null }, destination: { label: '', coordinate: null }, departureLocal: defaultDeparture(), loadLb: '25000', intervalMiles: 25 }
function validate(trip: Trip): string | null {
  if (!mapboxToken) return 'Set VITE_MAPBOX_ACCESS_TOKEN in frontend/.env before comparing routes.'
  if (!trip.origin.coordinate || !trip.destination.coordinate) return 'Select both locations from the suggestions.'
  if (trip.origin.coordinate.every((v, i) => v === trip.destination.coordinate![i])) return 'Origin and destination must differ.'
  const departure = new Date(trip.departureLocal)
  if (!trip.departureLocal || Number.isNaN(departure.getTime())) return 'Choose a valid departure date and time.'
  if (departure.getTime() < Date.now() - 60000 || departure.getTime() + 48 * 3600000 > Date.now() + 16 * 86400000) return 'Choose a departure between now and 14 days from now.'
  if (trip.loadLb.trim() === '' || !Number.isFinite(Number(trip.loadLb)) || Number(trip.loadLb) < 0) return 'Enter a nonnegative numeric load weight.'
  if (![10, 25, 50].includes(trip.intervalMiles)) return 'Choose a valid checkpoint interval.'
  return null
}
function App() {
  const [trip, setTrip] = useState<Trip>(initialTrip)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [corridor, setCorridor] = useState<Corridor | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [loadingHeat, setLoadingHeat] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [heatError, setHeatError] = useState<string | null>(null)
  const revision = useRef(0)
  const planAbort = useRef<AbortController | null>(null)
  const heatAbort = useRef<AbortController | null>(null)
  useEffect(() => () => { planAbort.current?.abort(); heatAbort.current?.abort() }, [])
  const reset = (next: Trip) => {
    revision.current++
    planAbort.current?.abort(); heatAbort.current?.abort()
    setTrip(next); setPlan(null); setCorridor(null); setSelectedId(null); setOffset(0)
    setLoadingPlan(false); setLoadingHeat(false); setError(null); setHeatError(null)
  }
  const loadHeat = async (newPlan: Plan, currentRevision: number) => {
    heatAbort.current?.abort()
    const controller = new AbortController(); heatAbort.current = controller
    setLoadingHeat(true); setHeatError(null)
    try {
      const data = await getCorridor(newPlan, controller.signal)
      if (revision.current === currentRevision && !controller.signal.aborted) setCorridor(data)
    } catch (cause) {
      if (revision.current === currentRevision && !controller.signal.aborted) setHeatError(cause instanceof Error ? cause.message : 'Corridor forecast failed.')
    } finally { if (revision.current === currentRevision && !controller.signal.aborted) setLoadingHeat(false) }
  }
  const submit = async () => {
    const validation = validate(trip)
    if (validation) { setError(validation); return }
    const currentRevision = ++revision.current
    planAbort.current?.abort(); heatAbort.current?.abort()
    setPlan(null); setCorridor(null); setSelectedId(null); setOffset(0); setHeatError(null); setError(null); setLoadingPlan(true)
    const controller = new AbortController(); planAbort.current = controller
    try {
      const result = await getPlan({ origin: trip.origin.coordinate!, destination: trip.destination.coordinate!, departure_utc: new Date(trip.departureLocal).toISOString(), load_lb: Number(trip.loadLb), interval_miles: trip.intervalMiles }, controller.signal)
      if (revision.current !== currentRevision || controller.signal.aborted) return
      setPlan(result); setSelectedId(result.recommended_route_id || result.routes[0]?.id || null); setLoadingPlan(false)
      void loadHeat(result, currentRevision)
    } catch (cause) {
      if (revision.current === currentRevision && !controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Could not compare routes.'); setLoadingPlan(false) }
    }
  }
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div><strong>WEATHER AWARE</strong><small>TRUCK ROUTING</small></div></div><div className="topbar-right"><span className="live-dot"/> LIVE FORECAST INTELLIGENCE</div></header>
    <main className="main-layout">
      <aside className="sidebar"><TripForm trip={trip} onChange={reset} onSubmit={submit} busy={loadingPlan} error={error}/>{loadingPlan && <div className="loading-note" role="status"><span className="spinner"/> Loading roads and checkpoint forecasts…</div>}{plan && <RouteCards plan={plan} selectedId={selectedId} onSelect={setSelectedId}/>}</aside>
      <section className="map-panel" aria-label="Trip map"><div className="map-header"><div><span className="eyebrow">ROUTE WEATHER MAP</span><h1>Drive with the forecast.</h1><p>{plan ? `${plan.routes.length} real road ${plan.routes.length === 1 ? 'option' : 'options'} · ${plan.routes.reduce((sum, route) => sum + route.checkpoints.length, 0)} ETA checkpoints` : 'Compare routes, then explore forecast risk across the corridor.'}</p></div><div className="map-header-icon" aria-hidden="true">↗</div></div>
        <RouteMap plan={plan} selectedId={selectedId} corridor={corridor} offset={offset} onSelect={setSelectedId}/>
        <div className="map-footer">{plan ? <ForecastSlider plan={plan} corridor={corridor} offset={offset} onOffset={setOffset} error={heatError} loading={loadingHeat} onRetry={() => void loadHeat(plan, revision.current)}/> : <div className="map-placeholder"><strong>Forecast risk intensity</strong><span>Complete a trip to preview weather from departure through 48 hours.</span></div>}
          <div className="legend"><span><i style={{ background: '#4c9c79' }}/>Low</span><span><i style={{ background: '#e7ad45' }}/>Moderate</span><span><i style={{ background: '#e7804e' }}/>High</span><span><i style={{ background: '#cf534b' }}/>Severe</span><span><i style={{ background: '#803d57' }}/>No Travel</span><span><i style={{ background: '#9ba7a5' }}/>Unknown</span></div>
          <div className="attribution">Map data & routing © <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noreferrer">Mapbox</a> · Weather by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a></div>
        </div>
      </section>
    </main>
  </div>
}
export default App
