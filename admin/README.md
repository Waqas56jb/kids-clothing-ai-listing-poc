# Admin — Admin Console (Milestone 3)

A separate React app (its own deploy, independent of `../client`) for the
full admin console: system dashboard, project/job management, garment and
detection review, same-garment matching controls, groups/packages,
processing jobs monitor, a cross-project review queue, and listing review.

Blue/white design system shared with `../client` (same Tailwind theme
tokens), with a distinct rich blue-gradient sidebar so it reads as its own
console rather than another seller page. Icons via `lucide-react`,
notifications via `react-toastify`.

Requires the backend API to be running (see `../backend/README.md`).

## Setup & run

```bash
npm install
npm run dev
```

Opens on `http://localhost:5174` (the client app uses 5173 — both can run
side by side). The dev server proxies `/api` and `/files` to the backend at
`http://127.0.0.1:8000` (see `vite.config.js`).

## Linking to the seller app

The "← Seller view" link reads `VITE_CLIENT_URL`, falling back to
`http://localhost:5173` in dev. Once the seller app (`../client`) is
deployed, set `VITE_CLIENT_URL` as a Railway Variable on *this* service
(and rebuild — Vite bakes it in at build time) so the link points at the
real deployed seller app instead. The seller app's own "Admin →" link
works the same way in reverse via its `VITE_ADMIN_URL`.

## Pointing at a deployed backend

Same mechanism as the client app: `src/api.js` reads `VITE_API_URL` and
prefixes every request with it in production (falls back to relative
paths + the dev proxy locally). Set it as a Railway Variable on this
service and rebuild.

## Structure

```
src/
  auth/               session, profile, admin-only protected routes
  components/
    AdminLayout.jsx   sidebar + topbar chrome
    ui/               shared primitives: Button, Card, Badge, Input, Table,
                      Modal, Skeleton, EmptyState, Tabs, StatCard
    pages/            Login, Dashboard, Projects, ProjectDetail,
                      GarmentManagement, DetectionReview, MatchingReview,
                      Groups(+picker), JobsMonitor, ReviewQueue,
                      ListingPreview(+picker), Pricing
  lib/
    supabase.js       admin Supabase client
    garment.js        shared badge/tone logic for condition & match status
    groups.js         client-side grouping heuristic (size + category)
    listing.js        templated listing title/description from real attributes
  api.js              fetch wrappers: getJob, listJobs, fileUrl
```

`src/components/ui/*` and `src/lib/*` are intentionally duplicated from
`../client` rather than shared via a package — the two apps are separate
deployable units, so this keeps each one self-contained. If a real design
package is worth extracting later, these are the files to lift out.

## What's real vs. preview

Every page reads real data from the pipeline via `GET /api/jobs` and
`GET /api/jobs/{id}`. Groups/packages and listing copy have no backend
concept yet and are local-state-only previews, labeled **Preview** in the
UI; manual match confirm/reject decisions are local-state too (no
persistence endpoint exists yet).
