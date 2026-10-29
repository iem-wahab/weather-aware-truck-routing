import { timeLabel } from '../api'
import type { Corridor, Plan } from '../types'
export function ForecastSlider({ plan, corridor, offset, onOffset, error, loading, onRetry }: { plan: Plan; corridor: Corridor | null; offset: number; onOffset: (value: number) => void; error: string | null; loading: boolean; onRetry: () => void }) {
  const timestamp = new Date(new Date(plan.departure_utc).getTime() + offset * 3600000).toISOString()
  return <div className="forecast-control"><div className="forecast-heading"><div><span className="eyebrow">FORECAST PREVIEW</span><h3>Corridor weather</h3></div><span className="offset-pill">+{offset}h</span></div>
    <p>Risk intensity beside the roads at one shared time. Route cards and checkpoints stay tied to their individual trip ETAs.</p>
    <div className="slider-time">{timeLabel(timestamp)} <span>· your local time</span></div>
    <input aria-label="Forecast hour after departure" type="range" min="0" max="48" step="1" value={offset} onChange={event => onOffset(Number(event.target.value))} disabled={!corridor}/>
    <div className="slider-ends"><span>Departure</span><span>+48 hours</span></div>
    {loading && <div className="heat-status">Loading corridor forecast…</div>}
    {error && <div className="heat-status error-text">{error} <button type="button" onClick={onRetry}>Retry heatmap</button></div>}
    {corridor && <div className="heat-status">Forecast risk intensity · low to no travel</div>}
  </div>
}
