# AWS Lightsail + miniplagg.com

## Live URLs

| App | URL |
|-----|-----|
| Seller | https://miniplagg.com |
| Admin | https://admin.miniplagg.com |
| API | https://miniplagg.com/api/health |

## GoDaddy DNS (A records)

Point these to the Lightsail public IP `51.21.60.78`:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `@` | `51.21.60.78` | 600 |
| A | `www` | `51.21.60.78` | 600 |
| A | `admin` | `51.21.60.78` | 600 |

After saving in GoDaddy, wait a few minutes for DNS, then HTTPS certificates are issued automatically by Caddy.

## GitHub Actions secrets

| Secret | Value |
|--------|--------|
| `LIGHTSAIL_HOST` | `51.21.60.78` |
| `LIGHTSAIL_USER` | `ubuntu` |
| `LIGHTSAIL_SSH_KEY` | Full contents of `backend/.deploy/lightsail.pem` |

## Demo logins

| Role | Email | Password |
|------|-------|----------|
| Seller | seller@kidsailisting.com | SellerDemo123! |
| Admin | admin@kidsailisting.com | AdminDemo123! |
