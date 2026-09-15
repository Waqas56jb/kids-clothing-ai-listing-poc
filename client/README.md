# Client — Seller + Admin frontend

A routed, multi-page React app in a blue/white design system covering the
full Seller (Milestone 2) and Admin (Milestone 3) specs: upload, live AI
progress, garment results/detail/editing, same-garment matching review,
suggested groups/packages, and listing preview — plus an admin console for
projects, garment/detection review, jobs monitoring, and a cross-project
review queue.

Requires the backend API to be running (see `../backend/README.md`, "Web
API" section) — this app is just the UI on top of it.

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

## Structure

```
src/
  components/
    SellerLayout.jsx, AdminLayout.jsx   # topbar / sidebar chrome per persona
    ui/            shared primitives: Button, Card, Badge, Input, Table,
                   Modal, Skeleton, EmptyState, Tabs, Toast, StatCard
    seller/        Dashboard, Upload, Processing, Results, GarmentDetail,
                   MatchingReview, Groups, ListingPreview
    admin/         AdminDashboard, Projects, ProjectDetail,
                   GarmentManagement, DetectionReview, JobsMonitor,
                   ReviewQueue, AdminGroups/AdminListings (project pickers)
  lib/
    garment.js     shared badge/tone logic for condition & match status
    groups.js      client-side grouping heuristic (size + category)
    listing.js     templated listing title/description from real attributes
  api.js           fetch wrappers: createJob, getJob, listJobs, fileUrl
```

`App.jsx` is the route table (`react-router-dom`) — Seller routes render
inside `SellerLayout`, Admin routes inside `AdminLayout` at `/admin/*`.

## What's real vs. preview

Upload → processing → results → garment detail → matching review, and
every admin page, all read real data from the pipeline via `GET /api/jobs`
and `GET /api/jobs/{id}`. Three things have no backend concept yet and are
local-state-only previews, clearly labeled **Preview** in the UI: suggested
groups/packages, listing copy, and manual match confirm/reject decisions
(`lib/groups.js` / `lib/listing.js` isolate this logic so swapping in real
endpoints later is a clean boundary, not a rewrite). Garment detail edits
also stay local for the same reason — no `PATCH` endpoint exists yet.
