# kids-clothing-ai-listing-poc
AI computer vision POC for detecting and separating multiple children’s garments from images. Extracts size, category, brand, color, condition and OCR data with confidence scores. Matches the same garment across photos, prevents duplicates, and prepares structured data for intelligent grouping and listing generation.

Three independent apps, one per folder:

- [backend/README.md](backend/README.md) — the AI pipeline and its web API (FastAPI).
- [client/README.md](client/README.md) — Seller frontend: upload photos, watch live progress, review results, matching, groups, listings.
- [admin/README.md](admin/README.md) — Admin console: projects, garment/detection review, jobs monitor, review queue.

Run the backend first, then either frontend, to try each end-to-end. `client` and `admin` are separate deployable apps that both talk to the same backend — see each README for how they link to one another and to the backend once deployed.
