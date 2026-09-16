#!/bin/bash
# Install static frontend builds under Caddy (run on the server).
# Primary: miniplagg.com (seller) + admin.miniplagg.com (admin)
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

# Seller / marketing site
miniplagg.com, www.miniplagg.com {
	encode gzip zstd

	@www host www.miniplagg.com
	handle @www {
		redir https://miniplagg.com{uri} permanent
	}

	handle /api/* {
		reverse_proxy 127.0.0.1:8000
	}
	handle /files/* {
		reverse_proxy 127.0.0.1:8000
	}

	# Old path bookmarks → admin subdomain
	handle /admin* {
		redir https://admin.miniplagg.com/ permanent
	}

	handle {
		root * /var/www/client
		try_files {path} /index.html
		file_server
	}
}

# Admin console (own subdomain + same-origin /api)
admin.miniplagg.com {
	encode gzip zstd

	handle /api/* {
		reverse_proxy 127.0.0.1:8000
	}
	handle /files/* {
		reverse_proxy 127.0.0.1:8000
	}

	handle {
		root * /var/www/admin
		try_files {path} /index.html
		file_server
	}
}

# Legacy sslip / nip hosts → real domain
51.21.60.78.sslip.io, 51-21-60-78.sslip.io, 51.21.60.78.nip.io, 51-21-60-78.nip.io {
	encode gzip zstd
	handle /api/* {
		reverse_proxy 127.0.0.1:8000
	}
	handle /files/* {
		reverse_proxy 127.0.0.1:8000
	}
	handle /admin* {
		redir https://admin.miniplagg.com/ permanent
	}
	handle {
		redir https://miniplagg.com{uri} permanent
	}
}

admin.51.21.60.78.sslip.io, admin.51-21-60-78.sslip.io, admin-51-21-60-78.sslip.io, admin.51.21.60.78.nip.io {
	encode gzip zstd
	redir https://admin.miniplagg.com{uri} permanent
}

# Cloudflare tunnel HTTP origin (optional fallback)
:8080 {
	encode gzip zstd
	handle /api/* {
		reverse_proxy 127.0.0.1:8000
	}
	handle /files/* {
		reverse_proxy 127.0.0.1:8000
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

sleep 3
# Health on legacy host (always resolves). Domain checks may fail until DNS propagates.
curl -sf https://127.0.0.1:8000/api/health || curl -sf https://51.21.60.78.sslip.io/api/health || true
echo
curl -sfI https://miniplagg.com/ >/dev/null && echo OK_MINIPLAGG || echo WAIT_DNS_miniplagg.com
curl -sfI https://admin.miniplagg.com/ >/dev/null && echo OK_ADMIN || echo WAIT_DNS_admin.miniplagg.com
echo DONE_FRONTEND_DEPLOY
