# Weather Aware Truck Routing

A weather-aware route comparison app for planning a truck trip. The app draws real Mapbox driving routes, samples weather along each road at the estimated time of arrival, and recommends the lowest-risk eligible route. A separate 48-hour forecast layer lets you explore weather around the trip corridor.

> **Routing scope:** Mapbox's standard `driving` profile is used. The app does not check truck height, weight limits, hazardous-material rules, road closures, or other commercial-vehicle restrictions. Verify those separately before travel. Weather forecasts and risk labels are planning aids, not a travel clearance.

## What it does

- Searches cities and addresses with Mapbox Geocoding v6, including keyboard-accessible suggestions.
- Requests the primary Mapbox route and up to two real alternatives. If fewer exist, the app says so rather than inventing routes.
- Places checkpoints every 10, 25, or 50 miles using road-segment distances and durations, including the final partial interval.
- Fetches hourly Open-Meteo wind, rain, showers, and snowfall for checkpoint ETAs. Missing values remain **Unknown**.
- Applies weather and load-dependent wind thresholds, then ranks eligible routes by Severe miles, High miles, average risk, and driving time—in that order.
- Shows every route, risk-colored checkpoints, and a clickable weather popup on a Mapbox Light map.
- Loads up to 150 nearby corridor weather locations and previews 49 hourly heatmap frames locally with a 0–48-hour slider. The heatmap uses one shared timestamp; route summaries remain tied to each checkpoint's ETA.

## Stack and project layout

| Directory | Technology | Responsibility |
| --- | --- | --- |
| `frontend/` | React, TypeScript, Vite, Mapbox GL JS | Trip form, route comparison, map, forecast slider |
| `backend/` | Django, Django REST Framework, requests | Validation, Mapbox Directions, Open-Meteo forecasts, risk calculation |

The frontend calls Django through Vite's `/api` proxy during development. For deployment, `VITE_API_BASE_URL` points the frontend at the hosted API. The backend has no accounts, saved trips, or database-backed features. Raw forecasts use a 15-minute in-memory cache; weather requests are batched with no more than four outbound requests at once.

## Requirements

- Python **3.12**
- Node.js **22.12 or newer** and npm
- A Mapbox access token with Maps, Geocoding, and Directions access
- Internet access for Mapbox and Open-Meteo requests

Open-Meteo does not require a key. A public Mapbox token is necessarily used in the browser; restrict it to your site's allowed URLs in your Mapbox account before publishing a hosted version.

## Local setup

From the repository root:

```sh
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

Put your Mapbox token in `VITE_MAPBOX_ACCESS_TOKEN` in `frontend/.env` and `MAPBOX_ACCESS_TOKEN` in `backend/.env`. For local use, both variables can contain the same token. The `.env` files are ignored by Git and must never be committed. The existing local copy on this Mac is already configured; a fresh clone needs its own values.

Create a Django secret key for `DJANGO_SECRET_KEY` in `backend/.env`:

```sh
python3.12 -c 'import secrets; print(secrets.token_urlsafe(50))'
```

Start the API in one terminal:

```sh
cd backend
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

Start the frontend in a second terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/**. Keep both terminals running; press `Ctrl+C` in each to stop them. If a port is already in use, stop the older server on that port first. No migrations are needed.

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_MAPBOX_ACCESS_TOKEN` | `frontend/.env` | Map tiles and location search in the browser |
| `VITE_API_BASE_URL` | `frontend/.env` | Hosted API origin, such as `https://your-api.vercel.app`; leave empty for local development |
| `MAPBOX_ACCESS_TOKEN` | `backend/.env` | Mapbox Directions calls |
| `DJANGO_SECRET_KEY` | `backend/.env` | Required, unique key when `DEBUG=0` |
| `DEBUG` | `backend/.env` | `1` for local development; `0` for production |
| `DJANGO_ALLOWED_HOSTS` | `backend/.env` | Comma-separated backend hostnames; no wildcard in production |
| `DJANGO_CORS_ALLOWED_ORIGINS` | `backend/.env` | Comma-separated frontend origins allowed to call `/api/` from a browser |
| `DJANGO_HSTS_SECONDS` | `backend/.env` | Keep `0` locally; set a positive value after confirming HTTPS at the deployed domain |
| `DJANGO_TRUST_PROXY_SSL_HEADER` | deployment environment only | Set to `1` only behind a trusted proxy that supplies `X-Forwarded-Proto` |

The supplied `.env.example` files contain placeholders only. Production mode requires a secret key of at least 32 characters, explicit allowed hosts, and HTTPS. The app does not need an Open-Meteo key.

## How the recommendation works

Checkpoints follow the complete road geometry. The backend interpolates distance and driving time within the Mapbox segment containing each checkpoint. Wind is interpolated between hourly observations; rain and snowfall use the hourly accumulation interval containing the ETA. Rain is `(rain + showers) / 25.4` inches/hour, and snowfall is converted from centimeters to inches/hour. All calculations use UTC and unrounded weather values.

Each checkpoint takes the highest of wind, rain, and snow risk. Load can increase wind risk: over 40,000 lb at 35–45 mph becomes Severe, and over 30,000 lb at 45–55 mph becomes No Travel. Wind at or above 55 mph is No Travel for every load. Each span between checkpoints takes its higher endpoint risk. Routes with a No Travel checkpoint or missing ETA weather stay visible but cannot be recommended. Eligible routes are compared lexicographically by **fewest Severe miles → fewest High miles → lowest distance-weighted average risk → shortest driving time**.

Departure must be in the available forecast horizon and leave room for the 48-hour preview. The app uses the browser's local timezone for input and display and sends timezone-aware UTC timestamps to Django.

## API

Both endpoints accept and return JSON:

- `GET /api/health/` reports that the Django API is running; it does not call external providers.
- `POST /api/plan/` validates the trip and returns route geometry, checkpoints, risk summaries, recommendation, and corridor coordinates.
- `POST /api/corridor-weather/` returns 49 risk frames for the corridor coordinates and the plan's forecast window.

The route comparison renders first; heatmap loading is independent and can be retried without losing route results.

## Checks

```sh
cd backend
.venv/bin/python manage.py check
.venv/bin/python manage.py test routing
```

```sh
cd frontend
npm run build
```

GitHub Actions runs the same backend checks and frontend build on pushes and pull requests. Tests mock external providers; real provider calls require valid credentials and network access.

## Deploy on Vercel

Create **two Vercel projects from this same GitHub repository**, using the Hobby plan for a personal assessment. Use these exact root directories; Vercel reads each directory's own dependency files. Neither project needs a custom build command.

1. Push this repository to GitHub. In Vercel, choose **Add New → Project**, import the repository, set the project name (for example, `weather-routing-api`) and **Root Directory** to `backend`. Leave Framework Preset on Vercel's detected Django setting. Add these environment variables to **Production** before deploying:

   | Variable | Value |
   | --- | --- |
   | `MAPBOX_ACCESS_TOKEN` | Your Mapbox token with Directions access |
   | `DJANGO_SECRET_KEY` | A unique value from the command below |
   | `DEBUG` | `0` |
   | `DJANGO_ALLOWED_HOSTS` | The API hostname only, without `https://` (for example, `weather-routing-api.vercel.app`) |
   | `DJANGO_TRUST_PROXY_SSL_HEADER` | `1` |

   Generate the secret locally with `python3.12 -c 'import secrets; print(secrets.token_urlsafe(50))'`. Put it only in Vercel's environment variables, never in Git. Deploy and open `https://YOUR-API-DOMAIN/api/health/`; it should return `{"status":"ok"}`. If Vercel assigns a different domain than expected, update `DJANGO_ALLOWED_HOSTS` and redeploy the API.

2. Choose **Add New → Project** again, import the same repository, set **Root Directory** to `frontend`, and use Vercel's detected Vite settings. Add these **Production** environment variables:

   | Variable | Value |
   | --- | --- |
   | `VITE_MAPBOX_ACCESS_TOKEN` | Your browser Mapbox token with Maps and Geocoding access |
   | `VITE_API_BASE_URL` | The API origin from step 1, with `https://` and no path (for example, `https://weather-routing-api.vercel.app`) |

   Deploy the frontend and copy its exact production origin, such as `https://weather-aware-truck-routing.vercel.app`.

3. In the **API project**, add `DJANGO_CORS_ALLOWED_ORIGINS` with that frontend origin (include `https://`, omit any trailing slash). Redeploy the API so the new setting takes effect. CORS is limited to the configured origin and `/api/` paths.

4. Open the frontend in a private browser window. Search for two locations, plan a route, switch alternatives, and load the corridor weather layer. Check that the browser's Network tab shows successful requests to both `/api/plan/` and `/api/corridor-weather/` on the API domain. Test a longer trip as well: Vercel Functions currently limit request and response bodies to 4.5 MB. If a route exceeds that limit, reduce the API payload before sharing the link.

Vercel provides HTTPS on its domain. Keep `DJANGO_HSTS_SECONDS=0` until the final domain is confirmed. The 15-minute forecast cache is in memory and may reset between function instances. For a public launch beyond this assessment, add API rate limiting and monitor Mapbox/Open-Meteo quotas. The browser Mapbox token is visible to visitors; set appropriate URL restrictions in Mapbox, and use a separate server token if those restrictions block backend Directions calls.

Map data and directions: [Mapbox](https://www.mapbox.com/about/maps/). Weather: [Open-Meteo](https://open-meteo.com/).
