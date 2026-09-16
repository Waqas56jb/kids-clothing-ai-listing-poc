#!/bin/bash
# Rebuild and restart the API container on Lightsail (run on the server).
set -euo pipefail

APP_DIR=/opt/kids-ai
cd "$APP_DIR"

docker build -t kids-ai-api:latest .
docker rm -f kids-ai-api >/dev/null 2>&1 || true
docker run -d --name kids-ai-api --restart unless-stopped --network kids-ai-net \
  --env-file "$APP_DIR/.env" \
  -v /opt/kids-ai/models_cache:/app/models_cache \
  -p 8000:8000 \
  kids-ai-api:latest

sleep 5
curl -sf http://127.0.0.1:8000/api/health
echo
echo DONE_BACKEND_DEPLOY
