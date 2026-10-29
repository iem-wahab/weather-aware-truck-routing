import { durationLabel, miles, timeLabel } from '../api'
import type { Plan, Route } from '../types'
const number = (value: number) => value.toFixed(1)
function Card({ route, selected, recommended, onSelect, reason }: { route: Route; selected: boolean; recommended: boolean; onSelect: () => void; reason: string }) {
  return <button type="button" className={`route-card ${selected ? 'selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
    <div className="card-top"><div className="route-name"><span className={`route-swatch ${route.id}`}/><strong>{route.name}</strong></div>{recommended && <span className="recommended-badge">Recommended</span>}</div>
    <div className="route-primary"><span>{number(miles(route.distance_m))}<small>miles</small></span><span>{durationLabel(route.duration_s)}<small>drive time</small></span></div>
    <p className="arrival">Arrives {timeLabel(route.arrival_utc)}</p>
    <div className="route-metrics"><span><b>{number(route.severe_miles)}</b> Severe mi</span><span><b>{number(route.high_miles)}</b> High mi</span><span><b>{route.average_risk === null ? '—' : route.average_risk.toFixed(2)}</b> avg risk</span></div>
    <div className="card-bottom"><span className={`status status-${route.status.toLowerCase().replaceAll(' ', '-')}`}>{route.status}</span>{recommended && <span className="reason">{reason}</span>}</div>
  </button>
}
export function RouteCards({ plan, selectedId, onSelect }: { plan: Plan; selectedId: string | null; onSelect: (id: string) => void }) {
  return <section className="results"><div className="section-heading"><span className="eyebrow">02 / ROUTE COMPARISON</span><h2>Road options</h2><p>Checkpoint risks follow each route's estimated travel time.</p></div>
    {plan.availability_message && <div className="notice">{plan.availability_message}</div>}
    {!plan.recommended_route_id && <div className="notice warning">{plan.recommendation_explanation}</div>}
    <div className="cards">{plan.routes.map(route => <Card key={route.id} route={route} selected={selectedId === route.id} recommended={plan.recommended_route_id === route.id} onSelect={() => onSelect(route.id)} reason={plan.recommendation_explanation}/>)}</div>
  </section>
}
