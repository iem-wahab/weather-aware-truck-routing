export type Coord = [number, number]
export type Location = { label: string; coordinate: Coord | null }
export type Trip = { origin: Location; destination: Location; departureLocal: string; loadLb: string; intervalMiles: 10 | 25 | 50 }
export type Risk = 'Low' | 'Moderate' | 'High' | 'Severe' | 'No Travel' | null
export type Checkpoint = { coordinate: Coord; distance_m: number; eta_utc: string; wind_mph: number | null; rain_in_h: number | null; snow_in_h: number | null; risk: Risk; condition: string }
export type Route = { id: string; name: string; geometry: { type: 'LineString'; coordinates: Coord[] }; distance_m: number; duration_s: number; arrival_utc: string; checkpoints: Checkpoint[]; severe_miles: number; high_miles: number; average_risk: number | null; status: 'Eligible' | 'No Travel' | 'Incomplete forecast' }
export type Plan = { routes: Route[]; recommended_route_id: string | null; recommendation_explanation: string; availability_message: string | null; corridor_coordinates: Coord[]; forecast_window: [number, number]; departure_utc: string; load_lb: number }
export type Corridor = { timestamps_utc: string[]; risk_frames: (number | null)[][] }
