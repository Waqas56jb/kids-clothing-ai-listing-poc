# AWS Lightsail auto-deploy

Push to `main` rebuilds and updates production on Lightsail via GitHub Actions.

## Live URLs

| App | URL |
|-----|-----|
| Seller | https://51.21.60.78.sslip.io |
| Admin | https://admin.51.21.60.78.sslip.io |
| API | https://51.21.60.78.sslip.io/api/health |

## One-time GitHub secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|--------|--------|
| `LIGHTSAIL_HOST` | `51.21.60.78` |
| `LIGHTSAIL_USER` | `ubuntu` |
| `LIGHTSAIL_SSH_KEY` | Full contents of `backend/.deploy/lightsail.pem` (including `-----BEGIN…` / `END…` lines) |

## What runs on push

- Changes under `client/` or `admin/` → build Vite apps → upload to `/var/www` → reload Caddy
- Changes under `backend/` → rsync code → `docker build` + restart `kids-ai-api`
- Manual run: Actions → **Deploy AWS Lightsail** → Run workflow

`.env` on the server is never overwritten by CI (Postgres / S3 / JWT / OpenAI stay on the instance).
