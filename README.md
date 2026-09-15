# kids-clothing-ai-listing-poc
AI computer vision POC for detecting and separating multiple children’s garments from images. Extracts size, category, brand, color, condition and OCR data with confidence scores. Matches the same garment across photos, prevents duplicates, and prepares structured data for intelligent grouping and listing generation.

- [backend/README.md](backend/README.md) — the AI pipeline and its web API.
- [client/README.md](client/README.md) — React app: upload photos, watch live progress, see results.

Run the backend API first, then the client, to try the upload → results flow end-to-end.
