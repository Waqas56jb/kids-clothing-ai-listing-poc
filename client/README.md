# Client — AI Clothing Listing (upload → live progress → results)

A simple, responsive React app: upload seller photos, watch the AI pipeline
work through them in real time, and see the detected garments on screen.
This is the upload/results flow only — the full seller/admin review UI
(accept/edit/merge/split, grouping, listings) is Milestone 2.

Requires the backend API to be running (see `../backend/README.md`,
"Web API" section) — this app is just the UI on top of it.

## Setup & run

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`. The dev server proxies `/api` and
`/files` to the backend at `http://127.0.0.1:8000` (see `vite.config.js`) —
start the backend first.

## Pointing at a deployed backend

`src/api.js` reads `VITE_API_URL` and prefixes every request with it in a
production build (in dev, requests stay relative and go through the Vite
proxy above). Vite bakes this in at *build* time, not runtime, so on
Railway it has to be set as a **Variable on the frontend service** and the
service **rebuilt** (a plain restart won't pick up a new value) —
`Settings → Variables → VITE_API_URL = https://<your-backend>.up.railway.app`.
If it's ever unset, `api.js` falls back to the backend URL this project is
currently deployed at, so the deployed app keeps working either way.

## How it works

`src/App.jsx` is a small screen state machine:

1. **Upload** (`components/UploadScreen.jsx`) — drag-and-drop or pick
   multiple photos, preview thumbnails, then `POST /api/jobs`.
2. **Processing** (`components/ProcessingScreen.jsx`) — polls
   `GET /api/jobs/{id}` every ~1.5s and shows live stage/progress. A real
   photo can take 1-4+ minutes to fully process (SAM2 segmentation + a
   vision LLM call per detected item), so this is a background job the UI
   watches, not a single blocking request.
3. **Results** (`components/ResultsScreen.jsx` + `GarmentCard.jsx`) — a
   responsive card grid (1 column on phones, up to 4 on desktop) showing
   each detected garment's cropped photo, category/brand/size/color,
   condition, and match confidence, color-coded green/amber/red.
