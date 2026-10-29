import { LocationField } from './LocationField'
import type { Trip } from '../types'
export function TripForm({ trip, onChange, onSubmit, busy, error }: { trip: Trip; onChange: (next: Trip) => void; onSubmit: () => void; busy: boolean; error: string | null }) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'
  return <form className="trip-form" onSubmit={event => { event.preventDefault(); onSubmit() }}>
    <div className="section-heading"><span className="eyebrow">01 / TRIP SETUP</span><h2>Plan your drive</h2><p>Compare real road options against weather at each checkpoint.</p></div>
    <div className="field-stack">
      <LocationField id="origin" label="Origin" value={trip.origin} onChange={origin => onChange({ ...trip, origin })} />
      <div className="journey-line" aria-hidden="true"><i/><i/></div>
      <LocationField id="destination" label="Destination" value={trip.destination} onChange={destination => onChange({ ...trip, destination })} />
    </div>
    <div className="form-grid">
      <div className="field full"><label htmlFor="departure">Departure date & time</label><input id="departure" type="datetime-local" value={trip.departureLocal} onChange={event => onChange({ ...trip, departureLocal: event.target.value })}/><small>Shown in your browser timezone: {timezone}</small></div>
      <div className="field"><label htmlFor="load">Load weight</label><div className="input-suffix"><input id="load" type="number" min="0" step="1" value={trip.loadLb} onChange={event => onChange({ ...trip, loadLb: event.target.value })}/><span>lb</span></div></div>
      <div className="field"><label htmlFor="interval">Checkpoints</label><select id="interval" value={trip.intervalMiles} onChange={event => onChange({ ...trip, intervalMiles: Number(event.target.value) as 10 | 25 | 50 })}><option value="10">Every 10 mi</option><option value="25">Every 25 mi</option><option value="50">Every 50 mi</option></select></div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button" disabled={busy} type="submit">{busy ? 'Comparing routes…' : 'Compare routes'} <span aria-hidden="true">↗</span></button>
    <p className="routing-note">Routes use standard driving directions. Check truck-specific restrictions before travel.</p>
  </form>
}
