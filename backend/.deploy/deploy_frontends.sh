#!/bin/bash
# Install static frontend builds under Caddy (run on the server).
# Admin is served at /admin on the seller host so mobile networks that
# time out on admin.IP.sslip.io still reach the console.
set -euo pipefail

sudo mkdir -p /var/www/client /var/www/admin
sudo rm -rf /var/www/client/* /var/www/admin/*
sudo tar -xzf /tmp/client-dist.tar.gz -C /var/www/client
sudo tar -xzf /tmp/admin-dist.tar.gz -C /var/www/admin
sudo chown -R caddy:caddy /var/www/client /var/www/admin 2>/dev/null || true

sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
51.21.60.78.sslip.io, 51-21-60-78.sslip.io {
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

# When these hostnames resolve, send users to the working path URL.
admin.51.21.60.78.sslip.io, admin.51-21-60-78.sslip.io, admin-51-21-60-78.sslip.io {
	encode gzip zstd
	redir https://51.21.60.78.sslip.io/admin/ permanent
}
EOF

sudo caddy validate --config /etc/caddy/Caddyfile
sudo caddy fmt --overwrite /etc/caddy/Caddyfile || true
sudo systemctl reload caddy
sleep 3
curl -sfI https://51.21.60.78.sslip.io/ >/dev/null
curl -sfI https://51.21.60.78.sslip.io/admin/ >/dev/null
curl -sf https://51.21.60.78.sslip.io/api/health
echo
echo DONE_FRONTEND_DEPLOY
