# Client — Seller frontend (Milestone 2)

A routed, multi-page React app in a blue/white design system covering the
Seller spec: dashboard, multi-photo upload, live AI progress, garment
results/detail/editing, same-garment matching review, suggested
groups/packages, and listing preview. The admin console is a separate app
— see `../admin`.

Icons via `lucide-react`, notifications via `react-toastify`.

Requires the backend API to be running (see `../backend/README.md`, "Web
API" section) — this app is just the UI on top of it.

## Setup & run

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`. The dev server proxies `/api` and
`/files` to the backend at `http://127.0.0.1:8001` (see `vite.config.js`) —
start the backend first.

## Linking to the admin app

The "Admin →" link reads `VITE_ADMIN_URL`, falling back to
`http://localhost:5174` in dev. Once `../admin` is deployed, set
`VITE_ADMIN_URL` as a Railway Variable on *this* service (and rebuild —
Vite bakes it in at build time) so the link points at the real deployed
admin console instead.

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
  auth/                session, profile, protected routes
  components/
    SellerLayout.jsx   topbar chrome
    ui/                shared primitives: Button, Card, Badge, Input,
                       Skeleton, EmptyState, StatCard
    seller/            Login, Dashboard, Upload, Processing, Results,
                       GarmentCard, GarmentDetail, MatchingReview, Groups,
                       ListingPreview
  lib/
    supabase.js        seller Supabase client
    garment.js         shared badge/tone logic for condition & match status
    groups.js          client-side grouping heuristic (size + category)
    listing.js         templated listing title/description from real attributes
  api.js               fetch wrappers: createJob, getJob, listJobs, fileUrl
```

`src/components/ui/*` and `src/lib/*` are duplicated (not shared via a
package) in `../admin` too, since the two apps are separate deployable
units — see `../admin/README.md`.

## What's real vs. preview

Upload → processing → results → garment detail → matching review all read
real data from the pipeline via `GET /api/jobs` and `GET /api/jobs/{id}`.
Suggested groups/packages and listing copy have no backend concept yet and
are local-state-only previews, clearly labeled **Preview** in the UI
(`lib/groups.js` / `lib/listing.js` isolate this logic so swapping in real
endpoints later is a clean boundary, not a rewrite). Garment detail edits
also stay local for the same reason — no `PATCH` endpoint exists yet.
