# Backend — AI pipeline + web API

The `ai_engine/` package takes a folder of clothing photos and produces one
structured JSON record per **physical garment** (not per photo): detection
(Grounding DINO, open-vocabulary) → segmentation (SAM2) → OCR (PaddleOCR) →
attribute extraction (OpenAI vision, structured outputs) → embeddings (CLIP)
→ cross-photo matching. `app/` is a thin FastAPI layer over that pipeline
for the `client/` React app. See
`C:\Users\HP\.claude\plans\peaceful-finding-nest.md` for the full design
rationale and model choices.

All commands below assume you're inside this `backend/` folder.

### Setup

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt

copy .env.example .env
# then edit .env and set OPENAI_API_KEY
```

`requirements.txt` installs a CPU build of `paddlepaddle` automatically as a
dependency of `paddleocr` on Windows — no separate index needed.

On Windows, PyTorch also requires the **Microsoft Visual C++ 2015-2022
Redistributable (x64)** to be installed system-wide (not pip-installable) —
see https://aka.ms/vs/17/release/vc_redist.x64.exe if `import torch` fails
with a DLL load error.

### Run

```bash
.venv\Scripts\python scripts\download_models.py        # one-time: cache all model weights
.venv\Scripts\python scripts\run_pipeline.py --input sample_images --output outputs\run1
.venv\Scripts\python -m pytest tests\                   # matching-logic unit tests
```

Results land in `outputs\run1\result.json`, with intermediate crops/masks
under `outputs\run1\debug\` for visual sanity-checking of the segmentation
step.

`sample_images/` ships with 12 photos from the MIT-licensed
[clothing-dataset-small](https://github.com/alexeygrigorev/clothing-dataset-small)
dataset — enough to prove the pipeline runs end-to-end, but **not** a real
accuracy benchmark (no repeated photos of the same physical item, adult
clothing rather than kids'). Swap in real client photos for that.

### Web API (for the `client/` React app)

```bash
.venv\Scripts\python -m uvicorn app.main:app --reload
```

Runs on `http://127.0.0.1:8000`. Two endpoints:

- `POST /api/jobs` — multipart upload, one or more images. Saves them to
  `uploads/{job_id}/`, starts processing in a background thread (a real
  photo takes 1-4+ minutes), returns `{"job_id": "..."}` immediately.
- `GET /api/jobs/{job_id}` — `{status, stage, current, total, result}`.
  `status` is `queued|processing|done|error`; `result` (the same JSON shape
  `run_pipeline` writes to `result.json`) is only populated once done.

Crops/masks for a finished job are served as static files at
`/files/{job_id}/debug/masks/{detection_id}_masked.png`, etc.

### Layout

```
backend/
    ai_engine/       # the pipeline itself (detection, segmentation, ocr, ...)
    app/             # FastAPI layer: main.py (routes), jobs.py (background job store)
    scripts/         # CLI entry points
    tests/           # matching-logic unit tests
    sample_images/   # small public test set
    models_cache/    # downloaded model weights (gitignored)
    outputs/         # CLI-run results (gitignored)
    uploads/         # API-uploaded photos per job (gitignored)
    job_outputs/     # API job results per job (gitignored)
```
