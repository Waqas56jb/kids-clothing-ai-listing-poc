#!/bin/bash
# Install static frontend builds under Caddy (run on the server).
# Admin is at /admin on the seller host. HTTP/3 is disabled because some
# EU/mobile networks (incl. Sweden carriers) hang on QUIC/Alt-Svc.
set -euo pipefail

sudo mkdir -p /var/www/client /var/www/admin
sudo rm -rf /var/www/client/* /var/www/admin/*
sudo tar -xzf /tmp/client-dist.tar.gz -C /var/www/client
sudo tar -xzf /tmp/admin-dist.tar.gz -C /var/www/admin
sudo chown -R caddy:caddy /var/www/client /var/www/admin 2>/dev/null || true

sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
{
	servers {
		protocols h1 h2
	}
}

# sslip + nip + dash forms — pick whichever DNS works on the client network
51.21.60.78.sslip.io, 51-21-60-78.sslip.io, 51.21.60.78.nip.io, 51-21-60-78.nip.io {
	encode gzip zstd

	handle /api/* {
		reverse_proxy 127.0.0.1:8000
	}
	handle /files/* {
		reverse_proxy 127.0.0.1:8000
	}

	handle /admin {
		redir * /admin/ permanent
	}
	handle_path /admin/* {
		root * /var/www/admin
		try_files {path} /index.html
		file_server
	}

	handle {
		root * /var/www/client
		try_files {path} /index.html
		file_server
	}
}

# Deep admin.* hostnames — send browsers to /admin on a working host form
admin.51.21.60.78.sslip.io, admin.51-21-60-78.sslip.io, admin-51-21-60-78.sslip.io, admin.51.21.60.78.nip.io {
	encode gzip zstd
	redir https://51.21.60.78.sslip.io/admin/ permanent
}

# Plain HTTP origin for Cloudflare Tunnel (works when sslip/nip DNS is blocked)
:8080 {
	encode gzip zstd
	handle /api/* {
		reverse_proxy 127.0.0.1:8000
	}
	handle /files/* {
		reverse_proxy 127.0.0.1:8000
	}
	handle /admin {
		redir * /admin/ permanent
	}
	handle_path /admin/* {
		root * /var/www/admin
		try_files {path} /index.html
		file_server
	}
	handle {
		root * /var/www/client
		try_files {path} /index.html
		file_server
	}
}
EOF

sudo caddy validate --config /etc/caddy/Caddyfile
sudo caddy fmt --overwrite /etc/caddy/Caddyfile || true
sudo systemctl reload caddy

# Cloudflare quick tunnel — stable worldwide URL (no sslip DNS needed)
sudo tee /etc/systemd/system/kids-ai-tunnel.service >/dev/null <<'UNIT'
[Unit]
Description=Kids AI Cloudflare quick tunnel
After=network-online.target caddy.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8080
Restart=always
RestartSec=5
StandardOutput=append:/var/log/kids-ai-tunnel.log
StandardError=append:/var/log/kids-ai-tunnel.log

[Install]
WantedBy=multi-user.target
UNIT

if command -v cloudflared >/dev/null 2>&1; then
  sudo touch /var/log/kids-ai-tunnel.log
  sudo systemctl daemon-reload
  sudo systemctl enable --now kids-ai-tunnel.service
  sleep 4
  # Print latest trycloudflare URL if present
  sudo grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' /var/log/kids-ai-tunnel.log | tail -1 || true
fi

sleep 2
curl -sfI https://51.21.60.78.sslip.io/ >/dev/null
curl -sfI https://51.21.60.78.sslip.io/admin/ >/dev/null
curl -sf https://51.21.60.78.sslip.io/api/health
echo
echo DONE_FRONTEND_DEPLOY
