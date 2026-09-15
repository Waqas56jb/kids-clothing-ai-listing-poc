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
# then edit .env and set OPENAI_API_KEY plus the Supabase values

python scripts/apply_schema.py   # once: create profiles + jobs tables
python scripts/seed_users.py     # once: demo seller and admin logins
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

### Deploying to Railway

Railway's builder (Railpack) scans whatever it's given for something it
recognizes to build — since this repo has `backend/` and `client/` as
sibling folders with nothing at the repo root, it needs to be told to look
*inside* `backend/`. `railway.json` and `.python-version` here handle the
build/start commands once that's set; the root-directory piece has to be
set in the dashboard (there's no repo file for it):

1. In the Railway service → **Settings → Source → Root Directory**, set it
   to `backend`.
2. In **Settings → Variables**, add `OPENAI_API_KEY` (attribute extraction
   silently degrades without it — see "If `OPENAI_API_KEY` is missing" in
   the Config section above — it won't fail the build/deploy, just skip
   that step). The other `.env.example` values all have code defaults and
   don't need to be set unless you want to override them.
3. Redeploy. Railpack will now find `requirements.txt` inside `backend/`
   and use the `startCommand` from `railway.json`
   (`uvicorn app.main:app --host 0.0.0.0 --port $PORT`).

One thing worth knowing going in: this pipeline is genuinely heavy —
torch, transformers, paddleocr, and several hundred MB of model weights
downloaded on first use. Railway's smaller plans may be tight on RAM/CPU
for it, and without a persistent Volume mounted at `models_cache/`, every
redeploy re-downloads all the model weights from scratch (slow first
request after each deploy, not a failure). If it deploys but then crashes
or times out under load rather than failing to build, that's a
resource/plan-size question, not a code problem — worth flagging back here
if it happens.

`opencv-python` (pulled in by `ultralytics`/`paddlex` for `cv2`) needs
`libgl1`/`libglib2.0-0` on the system, which Railway's minimal image
doesn't have by default (`ImportError: libGL.so.1: cannot open shared
object file`) — `railpack.json` here tells Railpack to install those into
the deploy image. If a future Railpack version ignores that file for some
reason, the equivalent fix is a `RAILPACK_DEPLOY_APT_PACKAGES=libgl1
libglib2.0-0` service variable in the dashboard instead.

### Layout

```
backend/
    ai_engine/       # the pipeline itself (detection, segmentation, ocr, ...)
    app/             # FastAPI layer: auth, db, jobs, routes
    db/              # Postgres schema for profiles + jobs
    scripts/         # CLI: models, pipeline, schema apply, user seed
    tests/           # matching-logic unit tests
    sample_images/   # small public test set
    models_cache/    # downloaded model weights (gitignored)
    outputs/         # CLI-run results (gitignored)
    uploads/         # API-uploaded photos per job (gitignored)
    job_outputs/     # API job results per job (gitignored)
```
